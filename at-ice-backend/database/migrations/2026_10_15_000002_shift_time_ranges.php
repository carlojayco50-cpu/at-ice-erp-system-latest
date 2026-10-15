<?php

use App\Support\Settings;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// R3 (docs/REVIEW-DECISIONS.md): shifts are a time range (shift_start,
// shift_end), not Day or Night. Employees without their own times get the
// default range of their old label: Day = attendance.shift_start/end
// (09:00-18:00), Night = attendance.night_shift_start/end (21:00-06:00).
// Each one is written to the audit log (action employee.shift_migrated) so HR
// can review the mapping. The old `shift` column is kept, filled from the
// range (night when the shift ends the next day).
return new class extends Migration
{
    public function up(): void
    {
        $ranges = [
            'day' => [Settings::get('attendance.shift_start'), Settings::get('attendance.shift_end')],
            'night' => [Settings::get('attendance.night_shift_start'), Settings::get('attendance.night_shift_end')],
        ];

        foreach (DB::table('employees')->whereNull('shift_start')->orWhereNull('shift_end')->get(['id', 'shift', 'shift_start', 'shift_end']) as $e) {
            [$start, $end] = $ranges[$e->shift === 'night' ? 'night' : 'day'];
            $start = $e->shift_start ?: $start.':00';
            $end = $e->shift_end ?: $end.':00';
            DB::table('employees')->where('id', $e->id)->update(['shift_start' => $start, 'shift_end' => $end]);
            DB::table('audit_logs')->insert([
                'action' => 'employee.shift_migrated', 'subject_type' => 'Employee', 'subject_id' => $e->id,
                'before' => json_encode(['shift' => $e->shift]), 'after' => json_encode(['shift_start' => $start, 'shift_end' => $end]),
                'created_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // The ranges stay; the old label was never removed.
    }
};
