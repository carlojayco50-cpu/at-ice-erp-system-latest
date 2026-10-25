<?php

namespace Database\Seeders;

use App\Models\Applicant;
use App\Models\Attendance;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryContract;
use App\Models\DeliveryProof;
use App\Models\DriverLeave;
use App\Models\DriverStoreAssignment;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\IceLoading;
use App\Models\PickupLog;
use App\Models\Product;
use App\Models\Project;
use App\Models\Receipt;
use App\Models\StockMovement;
use App\Models\StockOutRequest;
use App\Models\Supplier;
use App\Models\SupportMessage;
use App\Models\User;
use App\Support\DeliveryDispatch;
use App\Support\DriverAvailability;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// Example data for every module, to try the system by hand. Local or test
// databases only; DemoSeeder runs it (php artisan db:seed --class=DemoSeeder).
// Running it again replaces everything it made. What it makes:
//
//   No logins (owner, 2026-10-22: no demo credentials; sign in with the test
//     accounts of LocalTestAccountsSeeder). The three demo Drivers are users
//     with a random password nobody knows, so they cannot sign in.
//   Customers (code DEMO-...), one or more per customer type, with
//     reference prices (SM, Alfamart, dealer) and an own price (Jollibee)
//   Deliveries: driver stores, an approved SM contract (2 weeks, daily), an
//     approved restaurant contract, a pending Alfamart contract to approve,
//     today: Ana and Ben timed in, Ben in transit, Carlo on emergency leave
//     (his stops were reassigned at random to Ana, the store told it may be
//     late), plus delivered stops with proof and invoices (paid, unpaid, overdue)
//   Inventory: supplies (one low), two suppliers, stock in, a pending stock
//     movement, stock-out requests (pending, approved, released) on a project
//   Projects: one Maintenance just added, one in progress
//   Applicants: interview booked, interviewed, from the QR form
//   Support Inbox, Ice Loading, Pickup Log and Expenses entries
class ModuleDemoSeeder extends Seeder
{
    private CarbonImmutable $today;

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('ModuleDemoSeeder is for local and test databases only.');

            return;
        }
        // Never email the demo stores.
        config(['mail.default' => 'log']);
        $this->today = CarbonImmutable::parse(DriverAvailability::today());

        $this->clear();

        $admin = User::where('role', 'admin')->orderBy('id')->first();
        if (! $admin) {
            $this->command?->error('Add an Admin first (php artisan admin:create).');

            return;
        }
        $checker = User::where('sub_role', 'checker')->first() ?? $admin;
        $salesman = User::where('sub_role', 'salesman')->first() ?? $admin;
        $maintenance = User::where('sub_role', 'maintenance')->first() ?? $admin;

        [$ana, $ben, $carlo] = $this->drivers();
        $stores = $this->customers();
        $this->deliveries($admin, $salesman, $checker, $ana, $ben, $carlo, $stores);
        $project = $this->projects($maintenance);
        $this->inventory($admin, $checker, $maintenance, $project);
        $this->applicants();
        $this->others($stores, $checker);

        $this->command?->info('Module demo data added (no demo logins; use the test accounts).');
    }

    // Everything a previous run made (also run on its own to take the demo
    // data out: `(new ModuleDemoSeeder)->clear()` in tinker).
    public function clear(): void
    {
        $customerIds = Customer::withTrashed()->where('customer_code', 'like', 'DEMO-%')->pluck('id');
        $driverIds = User::where('email', 'like', 'demo.%@atice.test')->pluck('id');
        $deliveryIds = Delivery::withTrashed()->where(fn ($q) => $q->whereIn('customer_id', $customerIds)->orWhereIn('driver_id', $driverIds))->pluck('id');
        $productIds = Product::withTrashed()->where('product_code', 'like', 'DEMO-%')->pluck('id');

        DB::table('payment_proofs')->whereIn('customer_id', $customerIds)->delete();
        DB::table('receipt_items')->whereIn('receipt_id', Receipt::whereIn('delivery_id', $deliveryIds)->pluck('id'))->delete();
        DB::table('receipts')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('delivery_proofs')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('ice_loadings')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('delivery_notifications')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('delivery_adjustment_requests')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('delivery_adjustments')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('delivery_arrivals')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('deliveries')->whereIn('parent_delivery_id', $deliveryIds)->update(['parent_delivery_id' => null]);
        DB::table('delivery_crews')->whereIn('driver_id', $driverIds)->delete();
        DB::table('delivery_items')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('deliveries')->whereIn('id', $deliveryIds)->delete();
        DB::table('delivery_contracts')->where('contract_no', 'like', 'DEMO-%')->delete();
        DB::table('driver_store_assignments')->whereIn('driver_id', $driverIds)->orWhereIn('store_id', $customerIds)->delete();
        DB::table('driver_leaves')->whereIn('driver_id', $driverIds)->delete();
        DB::table('support_messages')->whereIn('customer_id', $customerIds)->delete();
        DB::table('customer_prices')->whereIn('customer_id', $customerIds)->delete();
        DB::table('customers')->whereIn('id', $customerIds)->delete();

        DB::table('stock_out_requests')->whereIn('product_id', $productIds)->orWhere('purpose', 'like', '[Demo]%')->delete();
        DB::table('stock_movements')->whereIn('product_id', $productIds)->delete();
        DB::table('inventory_alerts')->whereIn('product_id', $productIds)->delete();
        DB::table('products')->whereIn('id', $productIds)->delete();
        DB::table('suppliers')->where('supplier_code', 'like', 'DEMO-%')->delete();
        DB::table('projects')->where('name', 'like', 'Demo: %')->delete();
        DB::table('applicants')->where('email', 'like', 'demo.%@example.com')->delete();
        DB::table('pickup_logs')->where('company_name', 'like', 'Demo %')->delete();
        DB::table('expenses')->where('notes', 'like', '[Demo]%')->delete();

        // only its own three Drivers (real staff can get EMP-91xx numbers too)
        $employeeIds = Employee::whereIn('employee_id', ['EMP-9101', 'EMP-9102', 'EMP-9103'])->whereIn('user_id', $driverIds)->pluck('id');
        DB::table('attendances')->whereIn('employee_id', $employeeIds)->delete();
        DB::table('employees')->whereIn('id', $employeeIds)->delete();
        DB::table('personal_access_tokens')->where('tokenable_type', User::class)->whereIn('tokenable_id', User::where('email', 'like', 'demo.%@atice.test')->pluck('id'))->delete();
        DB::table('users')->where('email', 'like', 'demo.%@atice.test')->delete();
    }

    private function user(string $email, string $name, string $role, ?string $subRole = null): User
    {
        // a random password nobody is told: a demo user cannot sign in
        $u = User::create(['name' => $name, 'email' => $email, 'password' => Str::random(40), 'role' => $role, 'sub_role' => $subRole]);
        $u->forceFill(['must_change_password' => false, 'is_active' => true])->save();

        return $u;
    }

    // Three Drivers with employee records; Ana and Ben timed in today.
    private function drivers(): array
    {
        $rows = [
            ['ana', 'Ana', 'Reyes', 'EMP-9101', 'N01-24-100101', 'NBA 1101'],
            ['ben', 'Ben', 'Cruz', 'EMP-9102', 'N02-23-100102', 'NBB 1102'],
            ['carlo', 'Carlo', 'Santos', 'EMP-9103', 'N03-22-100103', 'NBC 1103'],
        ];
        $out = [];
        foreach ($rows as [$key, $first, $last, $empId, $license, $plate]) {
            $u = $this->user("demo.driver.{$key}@atice.test", "{$first} {$last}", 'driver');
            $e = Employee::create([
                'user_id' => $u->id, 'employee_id' => $empId, 'first_name' => $first, 'last_name' => $last,
                'position' => 'Driver', 'employment_type' => 'regular', 'employment_status' => 'regular',
                'date_hired' => '2025-02-03', 'regularized_at' => '2025-08-03', 'daily_rate' => 650, 'pay_basis' => 'daily',
                'shift' => 'day', 'shift_start' => '07:00', 'shift_end' => '16:00',
                'license_number' => $license, 'license_expiry' => $this->today->addYears(3)->toDateString(),
                'vehicle_plate' => $plate, 'is_active' => true,
            ]);
            if ($key !== 'carlo') {
                Attendance::create([
                    'employee_id' => $e->id, 'date' => $this->today->toDateString(), 'time_in' => '06:55:00',
                    'hours_worked' => 0, 'late_minutes' => 0, 'status' => 'present',
                ]);
            }
            $out[] = $u;
        }

        return $out;
    }

    // One or more stores per customer type.
    private function customers(): array
    {
        $base = ['city' => 'San Jose del Monte', 'province' => 'Bulacan', 'region' => 'Region III (Central Luzon)', 'mop' => 'cash', 'is_active' => true];
        $rows = [
            'sm1' => ['SM Hypermarket Tungko', 'supermarket', 'SM', 'SMT', 'Tungkong Mangga', 14.8052, 121.0483],
            'sm2' => ['Savemore Muzon', 'supermarket', 'SM', 'SMM', 'Muzon', 14.7927, 121.0379],
            'alfa1' => ['Alfamart Graceville', 'convenience_store', 'Alfamart', 'ALG', 'Graceville', 14.8139, 121.0405],
            'alfa2' => ['Alfamart Sapang Palay', 'convenience_store', 'Alfamart', 'ALS', 'Sapang Palay', 14.8357, 121.0540],
            'seven' => ['7-Eleven Minuyan', 'convenience_store', '7-Eleven', 'SEM', 'Minuyan', 14.8256, 121.0644],
            'jolly' => ['Jollibee Tungko', 'supermarket', 'Jollibee', 'JBT', 'Tungkong Mangga', 14.8061, 121.0499],
            'inasal' => ['Mang Inasal Muzon', 'supermarket', 'Mang Inasal', 'MIM', 'Muzon', 14.7935, 121.0391],
            'dealer' => ['Demo Ice Dealer Kaypian', 'dealer', 'Independent', 'DIK', 'Kaypian', 14.7894, 121.0702],
        ];
        $out = [];
        $n = 0;
        foreach ($rows as $key => [$name, $type, $chain, $code, $barangay, $lat, $lng]) {
            $n++;
            $out[$key] = Customer::create($base + [
                'customer_code' => 'DEMO-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT), 'name' => $name, 'customer_type' => $type,
                'chain' => $chain, 'branch_code' => "{$code}-SJDM-001", 'invoice_code' => 'D'.$code,
                'barangay' => $barangay, 'address' => "{$barangay}, San Jose del Monte, Bulacan",
                'latitude' => $lat, 'longitude' => $lng, 'contact_person' => 'Store Manager',
                'contact_number' => '+639170000'.str_pad((string) (100 + $n), 3, '0', STR_PAD_LEFT),
                'email' => 'demo.store'.$n.'@example.com',
            ]);
        }

        // Restaurants have no reference price: an own price each.
        foreach (['jolly', 'inasal'] as $key) {
            foreach (['bags' => 30, 'small_sack' => 140, 'big_sack' => 230] as $type => $price) {
                CustomerPrice::create(['customer_id' => $out[$key]->id, 'product_type' => $type, 'unit_price' => $price]);
            }
        }

        return $out;
    }

    private function deliveries(User $admin, User $salesman, User $checker, User $ana, User $ben, User $carlo, array $s): void
    {
        $today = $this->today->toDateString();

        // Driver stores, from today
        foreach (['sm1' => $ana, 'sm2' => $ana, 'alfa1' => $ben, 'alfa2' => $ben, 'seven' => $ben, 'jolly' => $carlo, 'inasal' => $carlo, 'dealer' => $carlo] as $key => $driver) {
            DriverStoreAssignment::create(['driver_id' => $driver->id, 'store_id' => $s[$key]->id, 'effective_from' => $today, 'created_by' => $admin->id]);
        }

        $contract = function (string $no, string $name, ?string $chain, array $stores, int $days, array $dayList, string $time, array $items, string $status) use ($admin, $today) {
            $c = DeliveryContract::create([
                'contract_no' => $no, 'name' => $name, 'chain' => $chain, 'start_date' => $today,
                'end_date' => $this->today->addDays($days)->toDateString(), 'delivery_days' => $dayList,
                'delivery_time' => $time, 'items' => $items, 'status' => $status, 'created_by' => $admin->id,
                'approved_by' => $status === 'approved' ? $admin->id : null, 'approved_at' => $status === 'approved' ? now() : null,
            ]);
            $c->stores()->sync(collect($stores)->pluck('id'));
            if ($status === 'approved') {
                DeliveryDispatch::generate($c->load('stores'), $admin->id);
            }

            return $c;
        };
        $all = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        $contract('DEMO-C1', 'Demo SM daily supply', 'SM', [$s['sm1'], $s['sm2']], 13, $all, '08:00:00',
            [['product_type' => 'bags', 'quantity' => 40], ['product_type' => 'small_sack', 'quantity' => 6]], 'approved');
        $contract('DEMO-C2', 'Demo restaurants and dealer', null, [$s['jolly'], $s['inasal'], $s['dealer']], 13, $all, '10:00:00',
            [['product_type' => 'bags', 'quantity' => 25]], 'approved');
        $contract('DEMO-C3', 'Demo Alfamart and 7-Eleven (to approve)', 'Alfamart', [$s['alfa1'], $s['alfa2'], $s['seven']], 20,
            ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '09:00:00', [['product_type' => 'bags', 'quantity' => 30]], 'pending');

        // A one-off for Ben today (Alfamart is not on an approved contract yet), in transit
        $trip = Delivery::create([
            'delivery_no' => DeliveryDispatch::formatDeliveryNo(DeliveryDispatch::lastDeliveryNumber() + 1),
            'driver_id' => $ben->id, 'customer_id' => $s['alfa1']->id, 'delivery_type' => 'outbound',
            'status' => 'in_transit', 'scheduled_date' => $today, 'ordered_at' => now()->subHours(2), 'dispatched_at' => now()->subMinutes(40),
            'notes' => 'Demo one-off delivery', 'prepared_by' => $admin->id,
        ]);
        $trip->items()->create(['product_type' => 'bags', 'quantity_ordered' => 30, 'unit_price' => 24]);
        IceLoading::create(['delivery_id' => $trip->id, 'product_type' => 'bags', 'checker_id' => $checker->id, 'quantity_loaded' => 30, 'loaded_at' => now()->subHour()]);

        // Carlo is off today (an older-style off mark; Admin no longer marks
        // Drivers off, a Driver not timed in is detected): his stops today go
        // to a free driver (Ana; Ben is in transit)
        DriverLeave::create(['driver_id' => $carlo->id, 'date' => $today, 'type' => 'emergency', 'reason' => 'Demo: family emergency', 'recorded_by' => $admin->id]);
        DeliveryDispatch::reassign($carlo->id, $today);
        DeliveryDispatch::sendDelayNotices();

        // Delivered stops with proof and invoices: paid, unpaid, overdue
        $photo = 'demo/delivery-proof.png';
        Storage::disk('public')->put($photo, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGUlEQVR4nGNk+M+AFTBhFx4VHRUdFR0iogABKAEP+7JkOQAAAABJRU5ErkJggg=='));
        foreach ([[$s['sm1'], $ana, 1, 'paid'], [$s['seven'], $ben, 2, 'unpaid'], [$s['dealer'], $carlo, 20, 'overdue']] as [$store, $driver, $daysAgo, $pay]) {
            $day = $this->today->subDays($daysAgo);
            $price = CustomerPrice::priceFor($store->id, 'bags') ?? 25;
            $d = Delivery::create([
                'delivery_no' => DeliveryDispatch::formatDeliveryNo(DeliveryDispatch::lastDeliveryNumber() + 1),
                'driver_id' => $driver->id, 'customer_id' => $store->id, 'delivery_type' => 'outbound', 'status' => 'delivered',
                'scheduled_date' => $day->toDateString(), 'ordered_at' => $day->setTime(8, 0), 'dispatched_at' => $day->setTime(7, 30),
                'delivered_at' => $day->setTime(8, 20), 'notes' => 'Demo delivered stop', 'prepared_by' => $admin->id,
            ]);
            $d->items()->create(['product_type' => 'bags', 'quantity_ordered' => 20, 'unit_price' => $price]);
            $proof = DeliveryProof::create(['delivery_id' => $d->id, 'salesman_id' => $salesman->id, 'quantity' => 20, 'photo_path' => $photo, 'confirmed_at' => $day->setTime(8, 20), 'notes' => 'Received by the store manager']);
            $receipt = Receipt::create([
                'receipt_no' => Receipt::generateReceiptNo($store), 'delivery_id' => $d->id, 'delivery_proof_id' => $proof->id,
                'customer_id' => $store->id, 'salesman_id' => $salesman->id, 'quantity' => 20, 'unit_price' => $price,
                'total_amount' => 20 * $price, 'payment_status' => $pay,
                'payment_method' => $pay === 'paid' ? 'gcash' : null, 'paid_at' => $pay === 'paid' ? $day->setTime(15, 0) : null,
            ]);
            $receipt->forceFill(['created_at' => $day->setTime(8, 20)])->save();
            DB::table('receipt_items')->insert(['receipt_id' => $receipt->id, 'product_type' => 'bags', 'quantity' => 20, 'unit_price' => $price, 'line_total' => 20 * $price, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    private function projects(User $maintenance): Project
    {
        Project::create([
            'name' => 'Demo: Replace ice plant water pump', 'description' => 'The pump on line 2 leaks and loses pressure. Needs a new pump and fittings.',
            'location' => 'AT Ice plant, Tungkong Mangga, San Jose del Monte, Bulacan', 'status' => 'planned', 'priority' => 'medium',
            'created_by' => $maintenance->id,
        ]);

        return Project::create([
            'name' => 'Demo: Truck NBA 1101 brake overhaul', 'description' => 'Brake pads and fluid for the delivery truck before the SM contract.',
            'location' => 'AT Ice motor pool, Muzon, San Jose del Monte, Bulacan', 'status' => 'working', 'priority' => 'high',
            'owner' => 'Plant Supervisor', 'start_date' => $this->today->subDays(3)->toDateString(), 'due_date' => $this->today->addDays(4)->toDateString(),
            'budget' => 8500, 'created_by' => $maintenance->id,
        ]);
    }

    private function inventory(User $admin, User $checker, User $maintenance, Project $project): void
    {
        Supplier::create(['supplier_code' => 'DEMO-S1', 'name' => 'Demo Bulacan Plastic Supply', 'contact_person' => 'Liza Manalo', 'contact_number' => '+639171110001', 'email' => 'demo.plastic@example.com', 'city' => 'San Jose del Monte', 'province' => 'Bulacan', 'status' => 'active']);
        Supplier::create(['supplier_code' => 'DEMO-S2', 'name' => 'Demo North Truck Parts', 'contact_person' => 'Rey Bautista', 'contact_number' => '+639171110002', 'email' => 'demo.parts@example.com', 'city' => 'Marilao', 'province' => 'Bulacan', 'status' => 'active']);

        $items = [
            ['DEMO-P1', 'Demo ice bags 5kg (bundle of 100)', 'packaging', 'bundle', 180, 40, 15],
            ['DEMO-P2', 'Demo sacks 30kg', 'packaging', 'pc', 12, 300, 100],
            ['DEMO-P3', 'Demo brake pads (set)', 'truck_parts', 'set', 1450, 2, 3], // below minimum
            ['DEMO-P4', 'Demo brake fluid 1L', 'truck_parts', 'bottle', 320, 6, 2],
            ['DEMO-P5', 'Demo compressor oil 4L', 'machine_parts', 'can', 950, 5, 2],
        ];
        $products = [];
        foreach ($items as [$code, $name, $cat, $unit, $price, $stock, $min]) {
            $products[$code] = Product::create(['product_code' => $code, 'name' => $name, 'category' => $cat, 'unit' => $unit, 'unit_price' => $price, 'current_stock' => $stock, 'minimum_stock' => $min, 'maximum_stock' => $min * 10, 'is_active' => true]);
            StockMovement::create(['product_id' => $products[$code]->id, 'type' => 'stock_in', 'quantity' => $stock, 'stock_before' => 0, 'stock_after' => $stock, 'reference_no' => 'DEMO-IN-'.$code, 'source' => 'supplier', 'reason' => 'Demo opening stock', 'status' => 'confirmed', 'entered_by' => $checker->id, 'confirmed_by' => $admin->id, 'confirmed_at' => now()->subDays(5)]);
        }
        // a stock in waiting for Admin to confirm
        StockMovement::create(['product_id' => $products['DEMO-P1']->id, 'type' => 'stock_in', 'quantity' => 20, 'stock_before' => 40, 'stock_after' => 60, 'reference_no' => 'DEMO-IN-WAIT', 'source' => 'supplier', 'reason' => 'Demo delivery from supplier', 'status' => 'pending', 'entered_by' => $checker->id]);

        // stock-out requests on the brake project: released (used), approved, pending
        $req = fn (string $code, int $qty, string $status, string $purpose) => StockOutRequest::create([
            'requested_by' => $maintenance->id, 'product_id' => $products[$code]->id, 'project_id' => $project->id,
            'item_name' => $products[$code]->name, 'quantity' => $qty, 'purpose' => "[Demo] {$purpose}", 'status' => $status,
            'approved_by' => in_array($status, ['approved', 'released'], true) ? $admin->id : null,
            'approved_at' => in_array($status, ['approved', 'released'], true) ? now()->subDay() : null,
            'released_by' => $status === 'released' ? $admin->id : null, 'released_at' => $status === 'released' ? now()->subHours(20) : null,
        ]);
        $req('DEMO-P3', 1, 'released', 'Front brake pads for truck NBA 1101');
        $req('DEMO-P4', 2, 'approved', 'Brake fluid flush');
        $req('DEMO-P5', 1, 'pending', 'Compressor oil change, line 2');
    }

    private function applicants(): void
    {
        $base = ['city' => 'San Jose del Monte', 'province' => 'Bulacan', 'region' => 'Region III (Central Luzon)', 'interview_minutes' => 30];
        Applicant::create($base + ['name' => 'Demo Applicant Paolo Garcia', 'email' => 'demo.paolo@example.com', 'phone' => '+639182220001', 'position_applied' => 'Driver', 'status' => 'pending', 'source' => 'hr', 'interview_date' => $this->today->addDay()->setTime(10, 0)]);
        Applicant::create($base + ['name' => 'Demo Applicant Grace Lim', 'email' => 'demo.grace@example.com', 'phone' => '+639182220002', 'position_applied' => 'Checker', 'status' => 'interviewed', 'source' => 'hr', 'interview_date' => $this->today->subDays(2)->setTime(14, 0), 'notes' => 'Good with inventory counts.']);
        Applicant::create($base + ['name' => 'Demo Applicant Jun Ramos', 'email' => 'demo.jun@example.com', 'phone' => '+639182220003', 'position_applied' => 'Bagger', 'status' => 'pending', 'source' => 'qr']);
    }

    private function others(array $s, User $checker): void
    {
        SupportMessage::create(['customer_id' => $s['jolly']->id, 'user_id' => $s['jolly']->user_id, 'topic' => 'change_schedule', 'message' => 'Demo: can our delivery come at 9:00 AM instead of 10:00 AM starting next week?', 'status' => 'open']);
        PickupLog::create(['company_name' => 'Demo Walk-in: Aling Nena Store', 'product_type' => 'bags', 'quantity' => 10, 'recorded_by' => $checker->id, 'notes' => 'Picked up at the plant', 'pickup_date' => $this->today->toDateString()]);
        foreach ([['fuel', 4200], ['electricity', 18500], ['water', 2300]] as [$cat, $amount]) {
            Expense::create(['category' => $cat, 'amount' => $amount, 'expense_date' => $this->today->subDays(2)->toDateString(), 'notes' => '[Demo] '.ucfirst($cat).' this week']);
        }
    }
}
