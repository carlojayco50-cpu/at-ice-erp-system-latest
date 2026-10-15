<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Employee;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminInsightsTest extends TestCase
{
    use RefreshDatabase;

    private User $driver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 13)->setTime(15, 0));
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
        $this->driver = User::create(['name' => 'Pedro Santos', 'email' => 'santos.0001@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
    }

    private function invoice(Customer $customer, string $at, float $amount, int $bags, string $status = 'delivered'): Delivery
    {
        static $n = 0;
        $n++;
        $delivery = Delivery::create(['delivery_no' => "DEL-{$n}", 'driver_id' => $this->driver->id, 'customer_id' => $customer->id, 'status' => $status, 'scheduled_date' => substr($at, 0, 10), 'delivered_at' => $status === 'delivered' ? $at : null, 'prepared_by' => $this->driver->id]);
        if ($status !== 'delivered') {
            return $delivery;
        }
        $proof = DeliveryProof::create(['delivery_id' => $delivery->id, 'salesman_id' => $this->driver->id, 'quantity' => $bags, 'photo_path' => 'x.jpg', 'confirmed_at' => $at]);
        $r = Receipt::create(['receipt_no' => "INV-{$n}", 'delivery_id' => $delivery->id, 'delivery_proof_id' => $proof->id, 'customer_id' => $customer->id, 'salesman_id' => $this->driver->id, 'quantity' => $bags, 'total_amount' => $amount, 'payment_status' => 'unpaid']);
        $r->items()->create(['product_type' => 'bags', 'quantity' => $bags, 'unit_price' => $amount / $bags, 'line_total' => $amount]);
        $r->forceFill(['created_at' => $at])->saveQuietly();

        return $delivery;
    }

    public function test_mrr_and_next_month_follow_the_trend(): void
    {
        $pg = Customer::create(['name' => 'Pure Gold', 'customer_code' => 'C-1', 'branch_code' => 'B-1', 'invoice_code' => 'PG', 'is_active' => true]);
        $once = Customer::create(['name' => 'One Time', 'customer_code' => 'C-2', 'branch_code' => 'B-2', 'invoice_code' => 'OT', 'is_active' => true]);

        // Apr..Sep 2026: 1000, 2000, ... 6000 from Pure Gold (10 bags per 1000)
        foreach ([4, 5, 6, 7, 8, 9] as $i => $m) {
            $this->invoice($pg, sprintf('2026-%02d-10 10:00:00', $m), 1000 * ($i + 1), 10 * ($i + 1));
        }
        $this->invoice($once, '2026-09-20 10:00:00', 900, 9);

        $f = $this->getJson('/api/bi/forecast')->assertOk()->json();

        // Regular customer Pure Gold in Jul-Sep: (4000 + 5000 + 6000) / 3; One Time is not recurring.
        $this->assertEquals(5000, $f['mrr']);
        $this->assertSame(1, $f['regular_customers']);
        $this->assertSame('November 2026', $f['next_month']['label']);
        $this->assertSame('trend', $f['next_month']['method']);
        $this->assertGreaterThan(6000, $f['next_month']['revenue']);
        $this->assertGreaterThan(60, $f['next_month']['quantity']['bags']);
        $this->assertCount(6, $f['history']);
    }

    public function test_drivers_today_and_store_performance(): void
    {
        $emp = Employee::create(['user_id' => $this->driver->id, 'employee_id' => 'EMP-0001', 'first_name' => 'Pedro', 'last_name' => 'Santos', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-10-13', 'time_in' => '07:58:00', 'status' => 'present']);

        $pg = Customer::create(['name' => 'Pure Gold', 'customer_code' => 'C-1', 'branch_code' => 'B-1', 'invoice_code' => 'PG', 'is_active' => true]);
        $this->invoice($pg, '2026-10-13 09:00:00', 500, 10);
        $this->invoice($pg, '2026-10-13 11:00:00', 250, 5);
        $this->invoice($pg, '2026-10-13 12:00:00', 0, 0, 'in_transit');

        $s = $this->getJson('/api/bi/summary')->assertOk()->json();

        $d = $s['drivers_today'][0];
        $this->assertSame('Pedro Santos', $d['name']);
        $this->assertStringStartsWith('07:58', $d['time_in']);
        $this->assertSame(2, $d['delivered']);
        $this->assertSame(1, $d['in_transit']);

        $store = $s['stores'][0];
        $this->assertSame('PG', $store['invoice_code']);
        $this->assertSame(2, $store['deliveries']);
        $this->assertSame(15, $store['quantity']);
        $this->assertEquals(750, $store['revenue']);
        $this->assertEquals(750, $store['unpaid']);
    }
}
