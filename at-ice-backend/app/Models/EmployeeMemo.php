<?php

namespace App\Models;

use App\Support\Settings;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

// A disciplinary memo (HR > Memos). Missed Time Outs make automatic drafts
// (App\Support\MemoEngine) that escalate per offense: verbal warning, first
// written, final written, Notice to Explain. HR reviews every draft before it
// reaches the employee (twin-notice due process). Zero-tolerance offenses go
// straight to a Notice to Explain. Final written warnings, NTEs, zero-tolerance
// memos and memos to staff with no system account need a physical sign-off:
// HR uploads the scanned wet-signed copy to archive them.
class EmployeeMemo extends Model
{
    // key => [label, category]
    public const VIOLATIONS = [
        'no_time_out' => ['Failure to Time Out at the attendance kiosk', 'attendance'],
        'habitual_tardiness' => ['Habitual Tardiness', 'attendance'],
        'awol' => ['Absence Without Official Leave (AWOL)', 'attendance'],
        'insubordination' => ['Insubordination', 'conduct'],
        'misconduct' => ['Misconduct or Discourtesy to Customers', 'conduct'],
        'fuel_theft' => ['Fuel Theft / Siphoning', 'zero_tolerance'],
        'product_dumping' => ['Product Dumping (unauthorized disposal or sale of ice sacks)', 'zero_tolerance'],
        'cod_theft' => ['COD Remittance Theft / Unremitted Collections', 'zero_tolerance'],
        'under_influence' => ['Reporting for Duty Under the Influence (Alcohol or Drugs)', 'zero_tolerance'],
        'sabotage' => ['Intentional Equipment, Cold-Storage or Truck Sabotage', 'zero_tolerance'],
    ];

    public const LEVELS = [
        'verbal_warning' => 'Verbal Warning',
        'first_written' => 'First Written Warning',
        'final_written' => 'Final Written Warning',
        'nte' => 'Notice to Explain',
    ];

    public const STATUSES = ['draft', 'sent', 'acknowledged', 'awaiting_physical', 'archived', 'cancelled'];

    // what the employee can see: everything HR has sent
    public const VISIBLE_TO_EMPLOYEE = ['sent', 'acknowledged', 'awaiting_physical', 'archived'];

    protected $fillable = [
        'memo_no', 'employee_id', 'violation', 'category', 'level', 'offense_no', 'status', 'source',
        'subject', 'body', 'incident_date', 'attendance_id', 'issued_by', 'issued_at', 'acknowledged_at',
        'signed_at', 'cancelled_by', 'cancelled_at', 'cancel_reason',
    ];

    protected $casts = [
        'incident_date' => 'date',
        'issued_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'signed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    protected $appends = ['violation_label', 'level_label', 'needs_physical'];

    public static function categoryOf(string $violation): string
    {
        return self::VIOLATIONS[$violation][1] ?? 'conduct';
    }

    // 1st verbal, 2nd first written, 3rd final written, 4th and later NTE
    public static function levelForOffense(int $n): string
    {
        return match (true) {
            $n <= 1 => 'verbal_warning',
            $n === 2 => 'first_written',
            $n === 3 => 'final_written',
            default => 'nte',
        };
    }

    // Offense number of the next memo for this violation: earlier memos (drafts
    // included, cancelled ones not) within memo.strike_window_months, plus one.
    public static function nextOffenseNo(int $employeeId, string $violation): int
    {
        return self::where('employee_id', $employeeId)
            ->where('violation', $violation)
            ->where('status', '!=', 'cancelled')
            ->where('incident_date', '>=', now(config('atice.timezone'))->subMonths((int) Settings::get('memo.strike_window_months'))->toDateString())
            ->count() + 1;
    }

    public static function nextMemoNo(): string
    {
        $prefix = 'MEMO-'.now(config('atice.timezone'))->format('Ymd').'-';
        $last = self::where('memo_no', 'like', $prefix.'%')->orderByDesc('memo_no')->value('memo_no');

        return $prefix.str_pad((string) ($last ? ((int) substr($last, -3)) + 1 : 1), 3, '0', STR_PAD_LEFT);
    }

    // The draft letter HR reviews (and may edit) before sending.
    public static function draftBody(Employee $employee, string $violation, string $level, Carbon $incident, ?int $offenseNo = null): string
    {
        $name = $employee->full_name;
        $what = self::VIOLATIONS[$violation][0] ?? $violation;
        $date = $incident->format('F j, Y');
        $nth = $offenseNo ? self::ordinal($offenseNo).' ' : '';
        $company = 'Bella Erin Tube Ice Inc.';

        $facts = $violation === 'no_time_out'
            ? "Our attendance records show that on {$date} you timed in at the attendance kiosk but did not time out at the end of your shift. This is your {$nth}recorded offense of this kind."
            : "This concerns the following incident on {$date}: {$what}.".($offenseNo ? " This is your {$nth}recorded offense of this kind." : '');

        $closing = match ($level) {
            'verbal_warning' => 'This serves as a Verbal Warning. Please make sure to time out at the attendance kiosk at the end of every shift. A repeat of this offense will result in a written warning.',
            'first_written' => 'This serves as your First Written Warning. A repeat of this offense will result in a Final Written Warning.',
            'final_written' => 'This serves as your Final Written Warning. A repeat of this offense may lead to a Notice to Explain and disciplinary action up to and including termination of employment. Please report to the HR office to sign this memo.',
            default => self::VIOLATIONS[$violation][1] === 'zero_tolerance'
                ? 'This is a zero-tolerance offense under company policy. You are directed to submit a written explanation within five (5) calendar days from receipt of this notice why no disciplinary action, including termination of employment, should be taken against you. You may be placed under preventive suspension while the matter is investigated. You will be given the opportunity to be heard at an administrative hearing, where you may be assisted by a representative of your choice. Please report to the HR office to sign this notice.'
                : 'The repeated offense may constitute Gross and Habitual Neglect of Duties under Article 297 of the Labor Code. You are directed to submit a written explanation within five (5) calendar days from receipt of this notice why no disciplinary action, including termination of employment, should be taken against you. You will be given the opportunity to be heard at an administrative hearing, where you may be assisted by a representative of your choice. Please report to the HR office to sign this notice.',
        };

        return "Dear {$name},\n\n{$facts}\n\n{$closing}\n\n{$company}\nHuman Resources";
    }

    public static function subjectFor(string $violation, string $level): string
    {
        return self::LEVELS[$level].': '.(self::VIOLATIONS[$violation][0] ?? $violation);
    }

    private static function ordinal(int $n): string
    {
        $suffix = in_array($n % 100, [11, 12, 13], true) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');

        return $n.$suffix;
    }

    // Final written warnings, NTEs, zero-tolerance memos, and memos to staff
    // with no account (Guards, Baggers) are closed by a wet-signed copy.
    public function getNeedsPhysicalAttribute(): bool
    {
        return in_array($this->level, ['final_written', 'nte'], true)
            || $this->category === 'zero_tolerance'
            || ($this->relationLoaded('employee') ? ! $this->employee?->user_id : ! Employee::whereKey($this->employee_id)->value('user_id'));
    }

    public function getViolationLabelAttribute(): string
    {
        return self::VIOLATIONS[$this->violation][0] ?? (string) $this->violation;
    }

    public function getLevelLabelAttribute(): string
    {
        return self::LEVELS[$this->level] ?? (string) $this->level;
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function files()
    {
        return $this->hasMany(EmployeeMemoFile::class);
    }

    public function issuer()
    {
        return $this->belongsTo(User::class, 'issued_by');
    }
}
