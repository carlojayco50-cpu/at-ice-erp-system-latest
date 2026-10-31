<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryItem;
use App\Models\DeliveryProof;
use App\Models\Employee;
use App\Models\EmployeeMemo;
use App\Models\LeaveRequest;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Expense;
use App\Models\IceLoading;
use App\Models\PaymentProof;
use App\Models\PerformanceReview;
use App\Models\PickupLog;
use App\Models\Project;
use App\Models\StockOutRequest;
use App\Models\Receipt;
use App\Models\ReceiptItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupportMessage;
use App\Models\User;
use App\Support\LeaveCredits;
use App\Support\MemoEngine;
use App\Support\PayPeriod;
use App\Support\PayrollCalculator;
use App\Support\Rates;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

// Phase 1 of the thesis demo: six fictional employees with attendance for one
// completed cut-off. Local use only; refuses production and any non-SQLite
// database. Every demo row is marked, so cleanup removes only those rows.
//   php artisan thesis:demo dry-run | install | verify | cleanup
class ThesisDemo extends Command
{
    protected $signature = 'thesis:demo {action=dry-run : dry-run, install, verify, leave, accounts, memos, tickets, orders, deliveries, receipts, modules, ops, report or cleanup}';

    protected $description = 'Local thesis demo: fictional employees, attendance and payroll check for one completed cut-off';

    private const MARK = 'THESIS-DEMO';

    // The cut-off: 2026-09-28 to 2026-10-11, pay day 2026-10-16 (already past).
    private const PERIOD_DATE = '2026-09-28';

    // Demo staff. Times are the shift; late is minutes late on every work day.
    private const STAFF = [
        ['DEMO-0001', 'Ana Liza', 'Ramos', 'Checker', 'regular', 'day', 650, 0, 0],
        ['DEMO-0002', 'Jerome', 'Villanueva', 'Checker', 'regular', 'night', 650, 0, 0],
        ['DEMO-0003', 'Christine Mae', 'Bautista', 'Salesman', 'probationary', 'day', 620, 0, 0],
        ['DEMO-0004', 'Ramil', 'Santos', 'Salesman', 'probationary', 'night', 620, 0, 0],
        ['DEMO-0005', 'Dennis', 'Mercado', 'Maintenance', 'regular', 'day', 600, 25, 0],
        ['DEMO-0006', 'Lorna', 'Fabian', 'Maintenance', 'regular', 'day', 600, 0, 2],
    ];

    private const SHIFTS = [
        'day' => ['09:00:00', '18:00:00'],
        'night' => ['21:00:00', '06:00:00'],
    ];

    public function handle(): int
    {
        if (! $this->guard()) {
            return self::FAILURE;
        }

        return match ($this->argument('action')) {
            'dry-run' => $this->dryRun(),
            'install' => $this->install(),
            'verify' => $this->verify(),
            'leave' => $this->leave(),
            'accounts' => $this->accounts(),
            'report' => $this->report(),
            'memos' => $this->memos(),
            'tickets' => $this->tickets(),
            'orders' => $this->orders(),
            'deliveries' => $this->deliveries(),
            'receipts' => $this->receipts(),
            'modules' => $this->modules(),
            'ops' => $this->ops(),
            'cleanup' => $this->cleanup(),
            default => $this->refuse('Use dry-run, install, verify, leave, accounts, memos, tickets, orders, deliveries, report or cleanup.'),
        };
    }

    private function guard(): bool
    {
        if (app()->environment('production')) {
            $this->error('Refused: production environment.');

            return false;
        }
        if (config('database.default') !== 'sqlite') {
            $this->error('Refused: only the local SQLite database is supported in phase 1.');

            return false;
        }

        return true;
    }

    private function period(): array
    {
        return PayPeriod::for(self::PERIOD_DATE);
    }

    // The work days of the cut-off (Monday to Friday, from attendance.work_days).
    private function workDays(): array
    {
        $numbers = array_map('intval', explode(',', (string) \App\Support\Settings::get('attendance.work_days')));
        $days = [];
        $day = CarbonImmutable::parse($this->period()['start']);
        $end = CarbonImmutable::parse($this->period()['end']);
        while ($day->lte($end)) {
            if (in_array($day->dayOfWeekIso, $numbers, true)) {
                $days[] = $day->toDateString();
            }
            $day = $day->addDay();
        }

        return $days;
    }

    private function alreadyInstalled(): bool
    {
        return Employee::where('employee_id', 'like', 'DEMO-%')->exists();
    }

    private function dryRun(): int
    {
        $period = $this->period();
        $this->info("Cut-off {$period['start']} to {$period['end']}, pay day {$period['pay_day']}");
        $this->line('Work days in cut-off: '.count($this->workDays()));
        $this->line('Demo employees to create: '.count(self::STAFF));
        $this->line('Already installed: '.($this->alreadyInstalled() ? 'yes (run cleanup first)' : 'no'));

        return self::SUCCESS;
    }

    private function install(): int
    {
        if ($this->alreadyInstalled()) {
            return $this->refuse('Demo employees already exist. Run cleanup before installing again.');
        }

        foreach (self::STAFF as [$code, $first, $last, $position, $status, $shift, $rate, $late, $absent]) {
            $employee = Employee::create([
                'employee_id' => $code,
                'first_name' => $first,
                'last_name' => $last,
                'position' => $position,
                'department' => 'Operations',
                'daily_rate' => $rate,
                'pay_basis' => 'daily',
                'date_hired' => '2026-06-01',
                'regularized_at' => $status === 'regular' ? '2026-08-01' : null,
                'employment_status' => $status,
                'employment_type' => 'regular',
                'shift' => $shift,
                'shift_start' => self::SHIFTS[$shift][0],
                'shift_end' => self::SHIFTS[$shift][1],
                'address' => 'Sample address, '.self::MARK,
                'is_active' => true,
            ]);

            $skip = $absent;
            foreach ($this->workDays() as $date) {
                if ($skip > 0 && $date >= '2026-10-01') {
                    $skip--;

                    continue;
                }
                $this->recordDay($employee, $date, $shift, $late);
            }
        }

        $this->info('Installed '.count(self::STAFF).' demo employees and their attendance. Run verify next.');

        return self::SUCCESS;
    }

    private function recordDay(Employee $employee, string $date, string $shift, int $late): void
    {
        [$in, $out] = self::SHIFTS[$shift];
        $timeIn = CarbonImmutable::parse("{$date} {$in}");
        $timeIn = $timeIn->addMinutes($late);
        $timeOut = CarbonImmutable::parse("{$date} {$out}")->addDay(($shift === 'night') ? 1 : 0)->addMinutes($late);

        Attendance::create([
            'employee_id' => $employee->id,
            'date' => $date,
            'time_in' => $timeIn->format('H:i:s'),
            'time_out' => $timeOut->format('H:i:s'),
            'hours_worked' => 9,
            'late_minutes' => $late,
            'status' => $late > 0 ? 'late' : 'present',
            'notes' => self::MARK,
        ]);
    }

    // Independent expected values for one employee. Only the parts that do not
    // use the government tables: basic, late deduction and gross.
    // $skipped: work days with no Time In. When paid sick leave covers them they
    // are paid as leave, otherwise they are absences and earn nothing.
    private function expected(Employee $employee, int $late, int $skipped, bool $covered): array
    {
        $workDays = count($this->workDays());
        $daily = (float) $employee->daily_rate;
        $hourly = round($daily / 8, 2);
        $present = $workDays - $skipped;
        $paidLeave = $covered ? $skipped : 0;
        $absent = $covered ? 0 : $skipped;
        $basic = $present * $daily;
        $paidLeavePay = $paidLeave * $daily;
        $lateDeduction = $late * $workDays * ($hourly / 60);

        return [
            'days_present' => (float) $present,
            'late_minutes' => $late * $workDays,
            'absent_days' => $absent,
            'basic_pay' => round($basic, 2),
            'paid_leave_pay' => round($paidLeavePay, 2),
            'late_deduction' => round($lateDeduction, 2),
            'gross_pay' => round($basic + $paidLeavePay - $lateDeduction, 2),
        ];
    }

    private function hasLeave(Employee $employee): bool
    {
        return LeaveRequest::where('employee_id', $employee->id)->where('admin_notes', self::MARK)->exists();
    }

    // Paid sick leave for DEMO-0006's two absent days (1 and 2 October 2026),
    // paid from her credits as far as they go, as the approval step does.
    // No attachment is stored: the app asks for one on real filings.
    private function leave(): int
    {
        $employee = Employee::where('employee_id', 'DEMO-0006')->first();
        if (! $employee) {
            return $this->refuse('Install the demo first.');
        }
        if ($this->hasLeave($employee)) {
            return $this->refuse('The demo leave already exists for DEMO-0006.');
        }

        $start = '2026-10-01';
        $days = 2.0;
        $available = LeaveCredits::for($employee, $start)['available'];
        $paid = min($days, $available);

        $leave = new LeaveRequest([
            'employee_id' => $employee->id,
            'leave_type' => 'sick',
            'start_date' => $start,
            'end_date' => '2026-10-02',
            'total_days' => $days,
            'is_half_day' => false,
            'reason' => 'Sample sick leave (fictional record)',
            'status' => 'approved',
            'approved_at' => now(),
            'admin_notes' => self::MARK,
        ]);
        $leave->forceFill(['paid_days' => $paid, 'unpaid_days' => $days - $paid, 'is_paid' => $paid >= $days])->save();

        $this->info("Paid sick leave for DEMO-0006: {$paid} of {$days} day(s) paid from credits.");

        return self::SUCCESS;
    }

    private function verify(): int
    {
        if (! $this->alreadyInstalled()) {
            return $this->refuse('Demo employees are not installed. Run install first.');
        }

        $period = $this->period();
        $failures = 0;
        $rows = [];

        foreach (self::STAFF as [$code, , , , , , , $late, $absent]) {
            $employee = Employee::where('employee_id', $code)->firstOrFail();
            $calc = PayrollCalculator::compute($employee, $period);
            $want = $this->expected($employee, $late, $absent, $this->hasLeave($employee));

            $checks = [
                'days_present' => [(float) $calc['days_present'], $want['days_present']],
                'late_minutes' => [(int) $calc['late_minutes'], $want['late_minutes']],
                'absent_days' => [(int) $calc['absent_days'], $want['absent_days']],
                'basic_pay' => [(float) $calc['basic_pay'], $want['basic_pay']],
                'paid_leave_pay' => [(float) $calc['paid_leave_pay'], $want['paid_leave_pay']],
                'late_deduction' => [(float) $calc['late_deduction'], $want['late_deduction']],
                'gross_pay' => [(float) $calc['gross_pay'], $want['gross_pay']],
            ];

            foreach ($checks as $name => [$got, $expect]) {
                if (abs($got - $expect) > 0.01) {
                    $failures++;
                    $this->error("{$code} {$name}: calculator {$got}, expected {$expect}");
                }
            }

            $rows[] = [$code, $employee->employment_status, $employee->shift, $calc['gross_pay'], $calc['net_pay'], $calc['sss_deduction'] + $calc['philhealth_deduction'] + $calc['pagibig_deduction'], $calc['tax_deduction']];
        }

        $this->table(['Employee', 'Status', 'Shift', 'Gross', 'Net', 'Gov total', 'Tax'], $rows);
        $this->line("Rate check: hourly for 650 is ".Rates::hourly(650).' (expected 81.25)');

        if ($failures > 0) {
            return $this->refuse("{$failures} check(s) did not match.");
        }
        $this->info('All independent checks matched. Government amounts are calculator output, not independently verified.');

        return self::SUCCESS;
    }

    // One login per demo employee. Passwords are random, stored hashed, and
    // written once to a file that git ignores. Run once, after install.
    private function accounts(): int
    {
        $employees = Employee::where('employee_id', 'like', 'DEMO-%')->whereNull('user_id')->get();
        if ($employees->isEmpty()) {
            return $this->refuse('No demo employee is waiting for an account. Run install first, or accounts already exist.');
        }

        $dir = storage_path('thesis-demo');
        File::ensureDirectoryExists($dir);
        $path = $dir.'/accounts.csv';
        $out = fopen($path, 'a');
        if (filesize($path) === 0) {
            fputcsv($out, ['login_email', 'role', 'sub_role', 'employee_code', 'temporary_password', 'must_change_password']);
        }

        foreach ($employees as $employee) {
            $number = preg_replace('/\D/', '', $employee->employee_id);
            $last = preg_replace('/[^a-z]/', '', strtolower(Str::ascii($employee->last_name)));
            $email = "{$last}.demo{$number}@thesis.test";
            $password = Str::random(16);

            $user = User::create([
                'name' => "{$employee->first_name} {$employee->last_name}",
                'email' => $email,
                'password' => Hash::make($password),
                'role' => 'employee',
                'sub_role' => strtolower($employee->position),
                'is_active' => true,
                'must_change_password' => true,
            ]);
            $employee->update(['user_id' => $user->id]);

            fputcsv($out, [$email, 'employee', strtolower($employee->position), $employee->employee_id, $password, 'yes']);
        }
        fclose($out);

        $this->info("Created {$employees->count()} accounts. Credentials are in {$path} (git ignored).");

        return self::SUCCESS;
    }

    // A missed Time Out on 27 October 2026 (inside the 7-day memo lookback). The
    // memo engine drafts the memo; this command then issues it, as HR would after
    // reviewing. The day has no payroll effect beyond the one day already present.
    private function memos(): int
    {
        $employee = Employee::where('employee_id', 'DEMO-0003')->first();
        if (! $employee) {
            return $this->refuse('Install the demo first.');
        }
        if (EmployeeMemo::where('employee_id', $employee->id)->where('source', 'auto')->exists()) {
            return $this->refuse('The demo memo already exists for DEMO-0003.');
        }

        Attendance::create([
            'employee_id' => $employee->id,
            'date' => '2026-10-27',
            'time_in' => '09:00:00',
            'time_out' => null,
            'hours_worked' => 0,
            'late_minutes' => 0,
            'status' => 'present',
            'notes' => self::MARK,
        ]);

        $made = MemoEngine::draftMissedTimeOuts(now(config('atice.timezone')));
        $memo = EmployeeMemo::where('employee_id', $employee->id)->where('source', 'auto')->first();
        if (! $memo) {
            return $this->refuse("The memo engine did not draft a memo (drafts created: {$made}).");
        }
        $memo->forceFill(['status' => 'issued', 'issued_at' => now()])->save();

        $this->info("Memo {$memo->memo_no} drafted and issued for DEMO-0003 (drafts created: {$made}).");

        return self::SUCCESS;
    }

    // Demo customers (labelled DEMO) and support tickets in each state the app
    // has: open, in progress, resolved and closed, plus an emergency ice request.
    private const DEMO_CUSTOMERS = [
        ['DEMO-C001', 'Nena Sari-Sari Store (DEMO)', 'dealer'],
        ['DEMO-C002', 'SM Demo City Branch (DEMO)', 'supermarket'],
        ['DEMO-C003', 'Mang Jun Ice Dealer (DEMO)', 'dealer'],
    ];

    private function tickets(): int
    {
        if (Customer::withTrashed()->where('customer_code', 'like', 'DEMO-C%')->exists()) {
            return $this->refuse('Demo customers already exist. Run cleanup first.');
        }

        // Each customer has a portal login; a ticket belongs to that login.
        $dir = storage_path('thesis-demo');
        File::ensureDirectoryExists($dir);
        $out = fopen($dir.'/accounts.csv', 'a');
        if (filesize($dir.'/accounts.csv') === 0) {
            fputcsv($out, ['login_email', 'role', 'sub_role', 'employee_code', 'temporary_password', 'must_change_password']);
        }

        $customers = [];
        foreach (self::DEMO_CUSTOMERS as [$code, $name, $type]) {
            $email = strtolower(str_replace('-', '', $code)).'@thesis.test';
            $password = Str::random(16);
            $login = User::create([
                'name' => $name,
                'email' => $email,
                'password' => Hash::make($password),
                'role' => 'customer',
                'is_active' => true,
                'must_change_password' => true,
            ]);
            fputcsv($out, [$email, 'customer', '', $code, $password, 'yes']);

            $customers[$code] = Customer::create([
                'user_id' => $login->id,
                'customer_code' => $code,
                'name' => $name,
                'customer_type' => $type,
                'address' => 'Sample address (fictional), '.self::MARK,
                'city' => 'San Jose del Monte',
                'province' => 'Bulacan',
                'contact_person' => 'Demo contact',
                'is_active' => true,
                'notes' => self::MARK,
            ]);
        }

        $tickets = [
            ['DEMO-C001', 'late_delivery', 'high', 'open', 'The 7 AM delivery came after 10 AM. Our stall was out of ice. (fictional)'],
            ['DEMO-C002', 'wrong_quantity', 'medium', 'in_progress', 'We received 20 sacks but the invoice says 25. (fictional)'],
            ['DEMO-C003', 'emergency_supply', 'high', 'open', 'We need 10 extra sacks today for a fiesta order. (fictional)'],
            ['DEMO-C001', 'billing', 'low', 'resolved', 'The October statement shows a double charge for one delivery. (fictional)'],
            ['DEMO-C002', 'feedback', 'low', 'closed', 'Thank you for the fast delivery last week. (fictional)'],
        ];
        foreach ($tickets as [$code, $topic, $priority, $status, $message]) {
            $ticket = SupportMessage::create([
                'customer_id' => $customers[$code]->id,
                'user_id' => $customers[$code]->user_id,
                'topic' => $topic,
                'priority' => $priority,
                'message' => $message,
                'status' => 'open',
            ]);
            if ($status !== 'open') {
                $ticket->forceFill(['status' => $status])->save();
            }
            if ($status === 'resolved' || $status === 'closed') {
                $ticket->forceFill(['resolution_note' => 'Credit applied on the next invoice (fictional).', 'resolved_at' => now(), 'closed_at' => $status === 'closed' ? now() : null])->save();
            }
        }

        fclose($out);
        $this->info('Created '.count($customers).' demo customers and '.count($tickets).' support tickets.');

        return self::SUCCESS;
    }

    // Two demo products, three orders in different states, and one partial payment.
    // Order totals are the quantity times the product price, as OrderController does.
    private function orders(): int
    {
        if (Product::where('product_code', 'like', 'DEMO-%')->exists()) {
            return $this->refuse('Demo products already exist. Run cleanup first.');
        }
        $customers = Customer::where('customer_code', 'like', 'DEMO-C%')->pluck('id', 'customer_code');
        if ($customers->count() < 3) {
            return $this->refuse('Install the demo customers first (tickets action).');
        }
        $admin = User::where('role', 'admin')->value('id');

        $products = [];
        foreach ([['DEMO-ICE25', 'Ice Block 25 kg (DEMO)', 85], ['DEMO-ICE50', 'Ice Block 50 kg (DEMO)', 160]] as [$code, $name, $price]) {
            $products[$code] = Product::create([
                'product_code' => $code,
                'name' => $name,
                'category' => 'ice',
                'unit' => 'sack',
                'unit_price' => $price,
                'current_stock' => 500,
                'minimum_stock' => 50,
                'maximum_stock' => 1000,
                'description' => self::MARK,
                'is_active' => true,
            ]);
        }

        $orders = [
            ['ORD-DEMO-001', 'DEMO-C001', [['DEMO-ICE25', 20]], 'partial', 'confirmed'],
            ['ORD-DEMO-002', 'DEMO-C002', [['DEMO-ICE50', 30]], 'unpaid', 'confirmed'],
            ['ORD-DEMO-003', 'DEMO-C003', [['DEMO-ICE25', 10]], 'unpaid', 'cancelled'],
        ];
        foreach ($orders as [$no, $customerCode, $lines, $paymentStatus, $status]) {
            $total = 0;
            $order = Order::create([
                'order_no' => $no,
                'customer_id' => $customers[$customerCode],
                'prepared_by' => $admin,
                'status' => $status,
                'order_date' => '2026-10-20',
                'delivery_date' => '2026-10-21',
                'total_amount' => 0,
                'amount_paid' => 0,
                'balance' => 0,
                'payment_status' => $paymentStatus,
                'notes' => self::MARK,
            ]);
            foreach ($lines as [$code, $qty]) {
                $product = $products[$code];
                $subtotal = $product->unit_price * $qty;
                $total += $subtotal;
                OrderItem::create(['order_id' => $order->id, 'product_id' => $product->id, 'quantity' => $qty, 'unit_price' => $product->unit_price, 'subtotal' => $subtotal]);
            }
            $order->forceFill(['total_amount' => $total, 'balance' => $total])->save();
        }

        // Partial payment on ORD-DEMO-001 (500 of 1,700).
        $first = Order::where('order_no', 'ORD-DEMO-001')->first();
        Payment::create([
            'payment_no' => 'PAY-DEMO-001',
            'order_id' => $first->id,
            'customer_id' => $first->customer_id,
            'received_by' => $admin,
            'amount' => 500,
            'mop' => 'cash',
            'payment_date' => '2026-10-22',
            'notes' => self::MARK,
        ]);
        $first->forceFill(['amount_paid' => 500, 'balance' => $first->total_amount - 500])->save();

        $this->info('Created 2 demo products, 3 orders (2 active, 1 cancelled) and 1 partial payment.');

        return self::SUCCESS;
    }

    // Two demo drivers and five deliveries: pending, queued, in transit,
    // delivered, and one reassigned from an absent driver. Driver logins are
    // role driver, as the app expects; no delivery is marked delivered without a
    // proof, and the delivered one carries a labelled sample proof note only.
    private function deliveries(): int
    {
        if (Delivery::where('delivery_no', 'like', 'DLV-DEMO-%')->exists()) {
            return $this->refuse('Demo deliveries already exist. Run cleanup first.');
        }
        $products = Product::where('product_code', 'like', 'DEMO-%')->get()->keyBy('product_code');
        $customers = Customer::where('customer_code', 'like', 'DEMO-C%')->get()->keyBy('customer_code');
        if ($products->count() < 2 || $customers->count() < 3) {
            return $this->refuse('Install the orders and tickets first.');
        }
        $admin = User::where('role', 'admin')->value('id');

        $drivers = [];
        foreach ([['DEMO-0007', 'Edgar', 'Pascual', 'NBX 4821'], ['DEMO-0008', 'Nestor', 'Reyes', 'NBY 7315']] as $i => [$code, $first, $last, $plate]) {
            $login = User::create([
                'name' => "{$first} {$last}",
                'email' => strtolower($last).'.demo'.preg_replace('/\D/', '', $code).'@thesis.test',
                'password' => Hash::make($pass = Str::random(16)),
                'role' => 'driver',
                'is_active' => true,
                'must_change_password' => true,
            ]);
            $employee = Employee::create([
                'user_id' => $login->id,
                'employee_id' => $code,
                'first_name' => $first,
                'last_name' => $last,
                'position' => 'Driver',
                'department' => 'Logistics',
                'daily_rate' => 700,
                'pay_basis' => 'daily',
                'date_hired' => '2026-06-01',
                'regularized_at' => '2026-08-01',
                'employment_status' => 'regular',
                'employment_type' => 'regular',
                'shift' => 'day',
                'shift_start' => '06:00:00',
                'shift_end' => '15:00:00',
                'vehicle_plate' => $plate,
                'address' => 'Sample address, '.self::MARK,
                'is_active' => true,
            ]);
            $drivers[] = $login;
            $this->appendAccount($login->email, 'driver', '', $code, $pass);
        }
        [$driverA, $driverB] = $drivers;

        $plan = [
            ['DLV-DEMO-001', $driverA, null, 'DEMO-C001', 'pending', '2026-10-31', null, null, null],
            ['DLV-DEMO-002', $driverA, null, 'DEMO-C002', 'in_transit', '2026-10-30', '2026-10-30 08:10:00', null, null],
            ['DLV-DEMO-003', $driverB, null, 'DEMO-C003', 'delivered', '2026-10-27', '2026-10-27 07:40:00', '2026-10-27 09:15:00', null],
            ['DLV-DEMO-004', $driverB, null, 'DEMO-C001', 'queued', '2026-10-31', null, null, 'Driver on emergency leave; waits for the next free driver (fictional).'],
            ['DLV-DEMO-005', $driverA, $driverB, 'DEMO-C002', 'pending', '2026-10-31', null, null, 'Reassigned from Nestor Reyes after his emergency leave (fictional).'],
        ];
        foreach ($plan as [$no, $driver, $from, $customerCode, $status, $date, $dispatched, $delivered, $notes]) {
            $delivery = Delivery::create([
                'delivery_no' => $no,
                'driver_id' => $driver->id,
                'reassigned_from_driver_id' => $from?->id,
                'customer_id' => $customers[$customerCode]->id,
                'delivery_type' => 'outbound',
                'status' => $status,
                'scheduled_date' => $date,
                'ordered_at' => '2026-10-26 14:00:00',
                'dispatched_at' => $dispatched,
                'delivered_at' => $delivered,
                'notes' => $notes ?? self::MARK,
                'prepared_by' => $admin,
                'is_top_up' => false,
            ]);
            $qty = $no === 'DLV-DEMO-003' ? 15 : 10;
            $product = $products['DEMO-ICE25'];
            DeliveryItem::create([
                'delivery_id' => $delivery->id,
                'product_id' => $product->id,
                'product_type' => 'small_sack',
                'quantity_ordered' => $qty,
                'quantity_delivered' => $status === 'delivered' ? $qty : 0,
                'unit_price' => $product->unit_price,
            ]);
        }

        $this->info('Created 2 demo drivers, 5 deliveries (pending, queued, in transit, delivered, reassigned).');

        return self::SUCCESS;
    }

    // Receipt for the delivered demo delivery (DLV-DEMO-003). No payment proof
    // file is stored: the app needs a real upload, so none is faked here.
    private function receipts(): int
    {
        if (Receipt::where('receipt_no', 'like', 'RCP-DEMO-%')->exists()) {
            return $this->refuse('The demo receipt already exists.');
        }
        $delivery = Delivery::where('delivery_no', 'DLV-DEMO-003')->first();
        if (! $delivery || $delivery->status !== 'delivered') {
            return $this->refuse('Install the deliveries first.');
        }
        // A receipt needs a delivery proof with a photo. The photo is a labelled
        // fictional sample (a 1x1 placeholder), and the proof says so; it is not a
        // real delivery photo and carries no GPS check.
        $proof = DeliveryProof::where('delivery_id', $delivery->id)->first();
        if (! $proof) {
            $samplePath = storage_path('thesis-demo/samples/SAMPLE-FICTIONAL-delivery-proof.png');
            File::ensureDirectoryExists(dirname($samplePath));
            File::put($samplePath, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
            $salesman = Employee::where('employee_id', 'DEMO-0003')->value('user_id');
            $proof = DeliveryProof::create([
                'delivery_id' => $delivery->id,
                'salesman_id' => $salesman,
                'quantity' => 15,
                'photo_path' => 'thesis-demo/samples/SAMPLE-FICTIONAL-delivery-proof.png',
                'confirmed_at' => '2026-10-27 09:15:00',
                'notes' => 'SAMPLE: fictional proof for the thesis demo. Not a real photo; no GPS check.',
            ]);
        }

        $item = DeliveryItem::where('delivery_id', $delivery->id)->first();
        $total = $item->quantity_delivered * $item->unit_price;

        $receipt = Receipt::create([
            'receipt_no' => 'RCP-DEMO-001',
            'delivery_id' => $delivery->id,
            'delivery_proof_id' => $proof->id,
            'customer_id' => $delivery->customer_id,
            'salesman_id' => $proof->salesman_id,
            'quantity' => $item->quantity_delivered,
            'unit_price' => $item->unit_price,
            'total_amount' => $total,
            'payment_status' => 'unpaid',
        ]);
        ReceiptItem::create([
            'receipt_id' => $receipt->id,
            'product_type' => 'small_sack',
            'quantity' => $item->quantity_delivered,
            'quantity_ordered' => $item->quantity_ordered,
            'unit_price' => $item->unit_price,
            'line_total' => $total,
        ]);

        $this->info("Receipt RCP-DEMO-001 for DLV-DEMO-003: {$total} unpaid.");

        return self::SUCCESS;
    }

    // Suppliers, stock movements that move the demo products' stock, dated
    // expenses, and one maintenance project. Stock levels after each movement
    // are stored and the product stock is set to the last one, so they agree.
    private function modules(): int
    {
        if (Supplier::where('supplier_code', 'like', 'DEMO-SPL-%')->exists()) {
            return $this->refuse('Demo suppliers already exist. Run cleanup first.');
        }
        $ice25 = Product::where('product_code', 'DEMO-ICE25')->first();
        $ice50 = Product::where('product_code', 'DEMO-ICE50')->first();
        if (! $ice25 || ! $ice50) {
            return $this->refuse('Install the orders first (products).');
        }
        $admin = User::where('role', 'admin')->value('id');

        Supplier::create(['supplier_code' => 'DEMO-SPL-01', 'name' => 'Bulacan Ice Plant (DEMO)', 'contact_person' => 'Demo contact', 'city' => 'Marilao', 'province' => 'Bulacan', 'status' => 'active', 'notes' => self::MARK]);
        Supplier::create(['supplier_code' => 'DEMO-SPL-02', 'name' => 'North Packaging Supply (DEMO)', 'contact_person' => 'Demo contact', 'city' => 'Meycauayan', 'province' => 'Bulacan', 'status' => 'active', 'notes' => self::MARK]);

        $moves = [
            [$ice25, 'stock_in', 200, 'PO-DEMO-001', 'production', 'Weekly production batch (fictional)', 'confirmed'],
            [$ice25, 'stock_out', 15, 'DLV-DEMO-003', 'delivery', 'Delivered to DEMO-C003', 'confirmed'],
            [$ice50, 'stock_out', 30, 'DLV-DEMO-002', 'delivery', 'Loaded for DEMO-C002, still in transit', 'pending'],
        ];
        foreach ($moves as [$product, $type, $qty, $ref, $source, $reason, $status]) {
            $before = $product->current_stock;
            $after = $type === 'stock_in' ? $before + $qty : $before - $qty;
            StockMovement::create([
                'product_id' => $product->id,
                'type' => $type,
                'quantity' => $qty,
                'stock_before' => $before,
                'stock_after' => $after,
                'reference_no' => $ref,
                'source' => $source,
                'reason' => $reason,
                'status' => $status,
                'entered_by' => $admin,
                'confirmed_by' => $status === 'confirmed' ? $admin : null,
                'confirmed_at' => $status === 'confirmed' ? now() : null,
            ]);
            if ($status === 'confirmed') {
                $product->forceFill(['current_stock' => $after])->save();
            }
        }

        foreach ([['fuel', 4500, '2026-10-05', 'Delivery truck diesel (fictional)'], ['water', 1200, '2026-10-08', 'Plant water bill (fictional)'], ['electricity', 8750, '2026-10-12', 'Plant electricity, September (fictional)']] as [$category, $amount, $date, $note]) {
            Expense::create(['category' => $category, 'amount' => $amount, 'expense_date' => $date, 'notes' => $note.' '.self::MARK]);
        }

        Project::create([
            'name' => 'Compressor Repair (DEMO)',
            'description' => 'Replace the seal on the ice compressor. Fictional demo project.',
            'location' => 'San Jose del Monte plant',
            'status' => 'working',
            'priority' => 'high',
            'owner' => 'Maintenance lead (demo)',
            'start_date' => '2026-10-20',
            'due_date' => '2026-11-05',
            'budget' => 35000,
            'created_by' => $admin,
        ]);

        $this->info('Created 2 suppliers, 3 stock movements (2 confirmed, 1 pending), 3 expenses and 1 maintenance project.');

        return self::SUCCESS;
    }

    // Payment proof (with a labelled sample file), a stock-out request, a pickup
    // log, an ice loading record on the in-transit delivery, and a performance review.
    // Rows are written directly, so no audit entries are created for them.
    private function ops(): int
    {
        if (PickupLog::where('company_name', 'like', 'Demo %')->exists()) {
            return $this->refuse('Demo operations already exist. Run cleanup first.');
        }
        $receipt = Receipt::where('receipt_no', 'RCP-DEMO-001')->first();
        $transit = Delivery::where('delivery_no', 'DLV-DEMO-002')->first();
        $admin = User::where('role', 'admin')->value('id');
        $checker = Employee::where('employee_id', 'DEMO-0001')->value('user_id');
        $maintenance = Employee::where('employee_id', 'DEMO-0005')->value('user_id');
        $ice50 = Product::where('product_code', 'DEMO-ICE50')->first();
        $project = Project::where('name', 'Compressor Repair (DEMO)')->first();
        if (! $receipt || ! $transit || ! $ice50) {
            return $this->refuse('Install the receipts, deliveries and products first.');
        }

        $samplePath = 'thesis-demo/samples/SAMPLE-FICTIONAL-payment-proof.png';
        File::ensureDirectoryExists(dirname(storage_path($samplePath)));
        File::put(storage_path($samplePath), base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
        PaymentProof::create([
            'receipt_id' => $receipt->id,
            'customer_id' => $receipt->customer_id,
            'submitted_by' => Customer::find($receipt->customer_id)->user_id,
            'file_path' => $samplePath,
            'file_disk' => 'local',
            'original_name' => 'SAMPLE-FICTIONAL-payment-proof.png',
            'method' => 'gcash',
            'reference_no' => 'DEMO-REF-0001',
            'status' => 'pending',
        ]);

        StockOutRequest::create([
            'requested_by' => $maintenance,
            'product_id' => $ice50->id,
            'project_id' => $project?->id,
            'item_name' => 'Ice Block 50 kg (DEMO)',
            'quantity' => 10,
            'purpose' => 'Compressor repair cooling test (fictional). '.self::MARK,
        ]);

        PickupLog::create([
            'company_name' => 'Demo Store Pickup (fictional)',
            'product_type' => 'small_sack',
            'quantity' => 5,
            'recorded_by' => $admin,
            'notes' => self::MARK,
            'pickup_date' => '2026-10-29',
        ]);

        IceLoading::create([
            'delivery_id' => $transit->id,
            'product_type' => 'small_sack',
            'checker_id' => $checker,
            'quantity_loaded' => 10,
            'loaded_at' => '2026-10-30 07:50:00',
        ]);

        PerformanceReview::create([
            'employee_id' => Employee::where('employee_id', 'DEMO-0001')->value('id'),
            'period_start' => '2026-07-01',
            'period_end' => '2026-09-30',
            'final_rating' => 4.5,
            'goal_target' => 'Zero late arrivals in the quarter',
            'remarks' => 'Sample review (fictional). '.self::MARK,
            'status' => 'draft',
            'updated_by' => $admin,
        ]);

        $this->info('Created a payment proof, a stock-out request, a pickup log, an ice loading record and a performance review.');

        return self::SUCCESS;
    }

    private function appendAccount(string $email, string $role, string $sub, string $code, string $password): void
    {
        $dir = storage_path('thesis-demo');
        File::ensureDirectoryExists($dir);
        $path = $dir.'/accounts.csv';
        $out = fopen($path, 'a');
        if (filesize($path) === 0) {
            fputcsv($out, ['login_email', 'role', 'sub_role', 'employee_code', 'temporary_password', 'must_change_password']);
        }
        fputcsv($out, [$email, $role, $sub, $code, $password, 'yes']);
        fclose($out);
    }

    // Payroll comparison for every demo employee, written to a CSV that git ignores.
    private function report(): int
    {
        if (! $this->alreadyInstalled()) {
            return $this->refuse('Demo employees are not installed. Run install first.');
        }

        $period = $this->period();
        $dir = storage_path('thesis-demo');
        File::ensureDirectoryExists($dir);
        $out = fopen($dir.'/THESIS-DEMO-PAYROLL.csv', 'w');
        fputcsv($out, ['employee_code', 'name', 'status', 'shift', 'daily_rate', 'days_present_expected', 'days_present_actual', 'late_minutes_expected', 'late_minutes_actual', 'absent_expected', 'absent_actual', 'paid_leave_pay_expected', 'paid_leave_pay_actual', 'basic_expected', 'basic_actual', 'late_deduction_expected', 'late_deduction_actual', 'gross_expected', 'gross_actual', 'sss', 'philhealth', 'pagibig', 'withholding_tax', 'net_pay', 'gov_and_tax_source', 'match']);

        foreach (self::STAFF as [$code, , , , , , , $late, $absent]) {
            $employee = Employee::where('employee_id', $code)->firstOrFail();
            $calc = PayrollCalculator::compute($employee, $period);
            $want = $this->expected($employee, $late, $absent, $this->hasLeave($employee));
            $pairs = [
                [$want['days_present'], $calc['days_present']],
                [$want['late_minutes'], $calc['late_minutes']],
                [$want['absent_days'], $calc['absent_days']],
                [$want['paid_leave_pay'], $calc['paid_leave_pay']],
                [$want['basic_pay'], $calc['basic_pay']],
                [$want['late_deduction'], $calc['late_deduction']],
                [$want['gross_pay'], $calc['gross_pay']],
            ];
            $match = collect($pairs)->every(fn ($p) => abs((float) $p[0] - (float) $p[1]) <= 0.01) ? 'yes' : 'no';

            fputcsv($out, [
                $code, "{$employee->first_name} {$employee->last_name}", $employee->employment_status, $employee->shift, $employee->daily_rate,
                $want['days_present'], $calc['days_present'], $want['late_minutes'], $calc['late_minutes'], $want['absent_days'], $calc['absent_days'],
                $want['paid_leave_pay'], $calc['paid_leave_pay'], $want['basic_pay'], $calc['basic_pay'], $want['late_deduction'], $calc['late_deduction'],
                $want['gross_pay'], $calc['gross_pay'], $calc['sss_deduction'], $calc['philhealth_deduction'], $calc['pagibig_deduction'], $calc['tax_deduction'], $calc['net_pay'],
                'calculator (government tables not independently checked)', $match,
            ]);
        }
        fclose($out);

        $this->info("Payroll report written to {$dir}/THESIS-DEMO-PAYROLL.csv");

        return self::SUCCESS;
    }

    // Deletes only what this command created, children before parents.
    private function cleanup(): int
    {
        $employees = Employee::where('employee_id', 'like', 'DEMO-%')->get();
        $ids = $employees->pluck('id');
        $employeeUsers = $employees->pluck('user_id')->filter()->values();
        $deliveryIds = Delivery::withTrashed()->where('delivery_no', 'like', 'DLV-DEMO-%')->pluck('id');
        $receiptIds = Receipt::where('receipt_no', 'like', 'RCP-DEMO-%')->pluck('id');
        $orderIds = Order::withTrashed()->where('order_no', 'like', 'ORD-DEMO-%')->pluck('id');
        $productIds = Product::withTrashed()->where('product_code', 'like', 'DEMO-%')->pluck('id');
        $customers = Customer::withTrashed()->where('customer_code', 'like', 'DEMO-C%')->where('notes', self::MARK);
        $customerIds = (clone $customers)->pluck('id');
        $customerUsers = (clone $customers)->pluck('user_id')->filter()->values();

        $counts = [];
        $counts['payment proofs'] = PaymentProof::where('reference_no', 'like', 'DEMO-REF%')->delete();
        $counts['receipt items'] = ReceiptItem::whereIn('receipt_id', $receiptIds)->delete();
        $counts['receipts'] = Receipt::whereIn('id', $receiptIds)->delete();
        $counts['delivery proofs'] = DeliveryProof::whereIn('delivery_id', $deliveryIds)->delete();
        $counts['ice loadings'] = IceLoading::whereIn('delivery_id', $deliveryIds)->delete();
        $counts['delivery items'] = DeliveryItem::whereIn('delivery_id', $deliveryIds)->delete();
        $counts['deliveries'] = Delivery::withTrashed()->whereIn('id', $deliveryIds)->forceDelete();
        $counts['payments'] = Payment::where('payment_no', 'like', 'PAY-DEMO-%')->delete();
        $counts['order items'] = OrderItem::whereIn('order_id', $orderIds)->delete();
        $counts['orders'] = Order::withTrashed()->whereIn('id', $orderIds)->forceDelete();
        $counts['stock-out requests'] = StockOutRequest::where('purpose', 'like', '%'.self::MARK)->delete();
        $counts['stock movements'] = StockMovement::whereIn('product_id', $productIds)->delete();
        $counts['products'] = Product::withTrashed()->whereIn('id', $productIds)->forceDelete();
        $counts['projects'] = Project::where('name', 'like', '%(DEMO)')->delete();
        $counts['suppliers'] = Supplier::withTrashed()->where('supplier_code', 'like', 'DEMO-SPL-%')->forceDelete();
        $counts['expenses'] = Expense::where('notes', 'like', '%'.self::MARK)->delete();
        $counts['pickup logs'] = PickupLog::where('company_name', 'like', 'Demo %')->delete();
        $counts['performance reviews'] = PerformanceReview::whereIn('employee_id', $ids)->delete();
        $counts['tickets'] = SupportMessage::whereIn('customer_id', $customerIds)->delete();
        $counts['memos'] = EmployeeMemo::whereIn('employee_id', $ids)->where('source', 'auto')->delete();
        $counts['leave rows'] = LeaveRequest::whereIn('employee_id', $ids)->where('admin_notes', self::MARK)->delete();
        $counts['attendance rows'] = Attendance::whereIn('employee_id', $ids)->where('notes', self::MARK)->delete();
        $counts['customers'] = $customers->forceDelete();
        Employee::whereIn('id', $ids)->update(['user_id' => null]);
        $counts['employees'] = Employee::whereIn('id', $ids)->delete();
        $counts['accounts'] = User::where('email', 'like', '%@thesis.test')->delete();

        File::delete(storage_path('thesis-demo/accounts.csv'));
        File::deleteDirectory(storage_path('thesis-demo/samples'));

        $this->info('Removed: '.collect($counts)->filter()->map(fn ($n, $what) => "{$n} {$what}")->implode(', ').'.');

        return self::SUCCESS;
    }

    private function refuse(string $message): int
    {
        $this->error($message);

        return self::FAILURE;
    }
}
