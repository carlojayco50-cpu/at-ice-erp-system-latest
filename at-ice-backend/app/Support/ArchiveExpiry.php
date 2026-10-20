<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\FaceData;
use App\Models\LeaveRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

// Inactive employees past the retention period (retention.years, R3).
// archive.expiry_action decides what happens to them each day:
//   REVIEW     nothing on its own; Admin decides in Settings (the default)
//   ANONYMIZE  personal details removed; employee ID, dates and pay history kept
//   PURGE      the employee and their records deleted
// Every action is audited. There is no scheduler: the live-feed poll runs it
// once a day while HR or Admin is online (php artisan archive:expire too).
class ArchiveExpiry
{
    public static function cutoff(): string
    {
        return now('Asia/Manila')->subYears((int) Settings::get('retention.years'))->toDateString();
    }

    // Inactive past the retention period, not kept by Admin, not anonymized yet.
    public static function expired()
    {
        $held = DB::table('retention_holds')->where('kind', 'employee')
            ->whereDate('kept_until', '>=', now('Asia/Manila')->toDateString())->pluck('ref')->all();

        return Employee::where('is_active', false)
            ->whereNotNull('deactivated_at')
            ->whereNull('anonymized_at')
            ->whereDate('deactivated_at', '<=', self::cutoff())
            ->whereNotIn('id', $held);
    }

    // Once a day, from the live-feed poll.
    public static function daily(): void
    {
        try {
            if (Settings::get('archive.expiry_action') === 'REVIEW'
                || ! Cache::add('archive-expiry:'.now('Asia/Manila')->toDateString(), true, now()->addDays(2))) {
                return;
            }
            self::run();
        } catch (Throwable $e) {
            Log::warning('ArchiveExpiry: '.$e->getMessage());
        }
    }

    // Applies archive.expiry_action to every expired employee; returns how many.
    public static function run(): int
    {
        $action = Settings::get('archive.expiry_action');
        if ($action === 'REVIEW') {
            return 0;
        }
        $count = 0;
        foreach (self::expired()->get() as $employee) {
            $action === 'PURGE' ? self::purge($employee, true) : self::anonymize($employee, true);
            $count++;
        }

        return $count;
    }

    public static function anonymize(Employee $employee, bool $auto = false): void
    {
        $label = "{$employee->employee_id} {$employee->full_name}";
        DB::transaction(function () use ($employee) {
            FaceData::where('employee_id', $employee->id)->delete();
            foreach (LeaveRequest::where('employee_id', $employee->id)->whereNotNull('attachment_path')->get() as $leave) {
                Storage::disk($leave->attachment_disk ?: 'public')->delete($leave->attachment_path);
                $leave->forceFill(['attachment_path' => null])->save();
            }
            if ($employee->user) {
                $employee->user->tokens()->delete();
                $employee->user->forceFill([
                    'name' => 'Former employee',
                    'email' => "anonymized-{$employee->user->id}@atice.invalid",
                    'password' => bcrypt(Str::random(40)),
                ])->save();
            }
            $employee->forceFill([
                'first_name' => 'Former',
                'middle_initial' => null,
                'last_name' => 'Employee',
                'suffix' => null,
                'phone' => null,
                'address' => null,
                'block_lot' => null,
                'street' => null,
                'subdivision' => null,
                'barangay' => null,
                'city' => null,
                'province' => null,
                'region' => null,
                'barangay_code' => null,
                'postal_code' => null,
                'vehicle_plate' => null,
                'license_number' => null,
                'license_expiry' => null,
                'anonymized_at' => now(),
            ] + array_fill_keys(array_merge(\App\Support\Biodata::FIELDS, \App\Support\Biodata::GOV_FIELDS), null))->save();
            // attached biodata files go too (private disk)
            foreach ($employee->documents()->get() as $doc) {
                \Illuminate\Support\Facades\Storage::disk('local')->delete($doc->path);
                $doc->delete();
            }
        });
        Audit::log('retention.anonymized', $employee, ['employee' => $label], ['auto' => $auto]);
    }

    public static function purge(Employee $employee, bool $auto = false): void
    {
        $label = "{$employee->employee_id} {$employee->full_name}";
        DB::transaction(function () use ($employee) {
            FaceData::where('employee_id', $employee->id)->delete();
            foreach ($employee->documents()->get() as $doc) {
                \Illuminate\Support\Facades\Storage::disk('local')->delete($doc->path);
            }
            // Attendance, leave, payroll and document rows go with it (foreign keys cascade).
            $employee->delete();
        });
        Audit::log('retention.deleted', null, ['employee' => $label], ['auto' => $auto]);
    }
}
