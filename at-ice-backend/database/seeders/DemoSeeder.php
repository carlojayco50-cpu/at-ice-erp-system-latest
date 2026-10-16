<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Support\Lateness;
use App\Support\PayPeriod;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Database\Seeder;

// Demo data for testing attendance, leave and payroll without real Time Ins
// (docs/REVIEW-DECISIONS.md). Local or test databases only:
//
//   php artisan db:seed --class=DemoSeeder
//
// Adds five attendance-only employees (no logins), EMP-9001 to EMP-9005, and
// fills the last ended pay period with their attendance:
//   EMP-9001  daily rate, regular: a late day and a half day
//   EMP-9002  monthly rate (16,000), regular: an absence, unpaid sick leave,
//             4 unpaid hours of emergency leave
//   EMP-9003  daily rate, probationary: two absences (unpaid)
//   EMP-9004  monthly rate, hired in the middle of the period
//   EMP-9005  inactive (deactivated), for the Archived list
// Running it again replaces these five and their records. It then runs
// ModuleDemoSeeder: example data for every other module.
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('DemoSeeder is for local and test databases only.');

            return;
        }

        Employee::where('employee_id', 'like', 'EMP-90%')->get()->each->delete();

        $period = PayPeriod::previous(now('Asia/Manila')->toDateString());
        $start = CarbonImmutable::parse($period['start']);
        $workDays = collect(CarbonPeriod::create($start, $period['end']))
            ->filter(fn ($d) => $d->isWeekday())
            ->map(fn ($d) => $d->toDateString())
            ->values();

        $base = ['position' => 'Guard', 'employment_type' => 'regular', 'shift' => 'day', 'shift_start' => '09:00', 'shift_end' => '18:00'];
        $daily = Employee::create($base + ['employee_id' => 'EMP-9001', 'first_name' => 'Dina', 'last_name' => 'Daily', 'daily_rate' => 610, 'pay_basis' => 'daily',
            'date_hired' => '2025-01-06', 'employment_status' => 'regular', 'regularized_at' => '2025-07-06']);
        $monthly = Employee::create($base + ['employee_id' => 'EMP-9002', 'first_name' => 'Mona', 'last_name' => 'Monthly', 'daily_rate' => 732.94, 'pay_basis' => 'monthly',
            'monthly_rate' => 16000, 'date_hired' => '2025-01-06', 'employment_status' => 'regular', 'regularized_at' => '2025-07-06']);
        $probation = Employee::create($base + ['employee_id' => 'EMP-9003', 'first_name' => 'Pia', 'last_name' => 'Probation', 'daily_rate' => 600, 'pay_basis' => 'daily',
            'date_hired' => $start->subMonths(2)->toDateString(), 'employment_status' => 'probationary']);
        $midHire = Employee::create($base + ['employee_id' => 'EMP-9004', 'first_name' => 'Mike', 'last_name' => 'Midhire', 'daily_rate' => 732.94, 'pay_basis' => 'monthly',
            'monthly_rate' => 16000, 'date_hired' => $workDays[3], 'employment_status' => 'probationary']);
        Employee::create($base + ['employee_id' => 'EMP-9005', 'first_name' => 'Ivy', 'last_name' => 'Inactive', 'daily_rate' => 600, 'pay_basis' => 'daily',
            'date_hired' => '2024-01-08', 'employment_status' => 'regular', 'regularized_at' => '2024-07-08', 'is_active' => false,
            'deactivated_at' => now()->subMonths(3)]);

        $in = function (Employee $e, string $day, string $timeIn = '08:55:00', float $hours = 8) {
            Attendance::create([
                'employee_id' => $e->id, 'date' => $day, 'time_in' => $timeIn, 'time_out' => '18:00:00', 'hours_worked' => $hours,
                'late_minutes' => $late = Lateness::minutes('09:00', $timeIn), 'status' => $late > 0 ? 'late' : 'present',
            ]);
        };

        foreach ($workDays as $i => $day) {
            // Daily: late on day 2, half day on day 4
            $in($daily, $day, $i === 1 ? '09:17:30' : '08:55:00', $i === 3 ? 3.5 : 8);
            // Monthly: day 5 absent, day 6 unpaid sick leave, day 7 with emergency leave hours
            if (! in_array($i, [4, 5], true)) {
                $in($monthly, $day, $i === 8 ? '09:05:00' : '08:58:00');
            }
            // Probationary: days 3 and 8 absent
            if (! in_array($i, [2, 7], true)) {
                $in($probation, $day);
            }
            // Mid-period hire: from the hire date
            if ($i >= 3) {
                $in($midHire, $day);
            }
        }

        LeaveRequest::create(['employee_id' => $monthly->id, 'leave_type' => 'sick', 'start_date' => $workDays[5], 'end_date' => $workDays[5], 'total_days' => 1,
            'reason' => 'Flu (demo)', 'status' => 'approved', 'is_paid' => false, 'paid_days' => 0, 'unpaid_days' => 1, 'approved_at' => now()]);
        LeaveRequest::create(['employee_id' => $monthly->id, 'leave_type' => 'emergency', 'start_date' => $workDays[6], 'end_date' => $workDays[6], 'total_days' => 0.5,
            'hours' => 4, 'reason' => 'Family emergency (demo)', 'status' => 'approved', 'is_paid' => false, 'paid_days' => 0, 'unpaid_days' => 0.5, 'approved_at' => now()]);

        $this->command?->info("Demo employees EMP-9001 to EMP-9005 with attendance for {$period['start']} to {$period['end']}.");

        // Example data for every other module (deliveries, contracts, invoices,
        // inventory, projects, applicants, support...).
        $this->call(ModuleDemoSeeder::class);
    }
}
