<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SalesChartTest extends TestCase
{
    use RefreshDatabase;

    private function receipt(string $no, string $at, float $amount): void
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUST-ALF-001'], ['name' => 'Alfamart Muzon', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);
        $sales = User::firstOrCreate(['email' => 'sales@atice.cloud'], ['name' => 'Salesman', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']);
        $delivery = Delivery::create(['delivery_no' => "DEL-{$no}", 'driver_id' => $sales->id, 'customer_id' => $customer->id, 'status' => 'delivered', 'scheduled_date' => substr($at, 0, 10), 'prepared_by' => $sales->id]);
        $proof = DeliveryProof::create(['delivery_id' => $delivery->id, 'salesman_id' => $sales->id, 'quantity' => 1, 'photo_path' => 'x.jpg', 'confirmed_at' => $at]);
        $r = Receipt::create(['receipt_no' => $no, 'delivery_id' => $delivery->id, 'delivery_proof_id' => $proof->id, 'customer_id' => $customer->id, 'salesman_id' => $sales->id, 'quantity' => 1, 'unit_price' => $amount, 'total_amount' => $amount, 'payment_status' => 'unpaid']);
        $r->forceFill(['created_at' => $at, 'updated_at' => $at])->saveQuietly();
    }

    public function test_a_past_day_month_or_year_is_compared_with_the_present_never_the_future(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 9)->setTime(14, 30));
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));

        $this->receipt('RCP-1', '2026-10-09 09:15:00', 500);
        $this->receipt('RCP-2', '2026-10-08 10:00:00', 200);
        $this->receipt('RCP-3', '2025-10-03 08:00:00', 300);

        // year: this year against last year by default; months not come yet are null
        $year = $this->getJson('/api/bi/sales-chart?period=year')->assertOk()->json();
        $this->assertSame('2025', $year['picked_label']);
        $this->assertEquals(700, $year['points'][9]['present']);
        $this->assertEquals(300, $year['points'][9]['picked']);
        $this->assertNull($year['points'][10]['present']);

        // month: a past month picked on the calendar against this month
        $month = $this->getJson('/api/bi/sales-chart?period=month&value=2025-10')->assertOk()->json();
        $this->assertSame('Oct 2025', $month['picked_label']);
        $this->assertCount(31, $month['points']);
        $this->assertEquals(500, $month['points'][8]['present']);
        $this->assertNull($month['points'][9]['present']);
        $this->assertEquals(300, $month['points'][2]['picked']);

        // day: a past day against today, hour by hour
        $day = $this->getJson('/api/bi/sales-chart?period=day&value=2026-10-08')->assertOk()->json();
        $this->assertCount(24, $day['points']);
        $this->assertEquals(500, $day['points'][9]['present']);
        $this->assertEquals(200, $day['points'][10]['picked']);
        $this->assertNull($day['points'][15]['present']);

        // picking the present compares it with the period before; the future is refused
        $this->assertSame('Oct 8, 2026', $this->getJson('/api/bi/sales-chart?period=day&value=2026-10-09')->json('picked_label'));
        $this->getJson('/api/bi/sales-chart?period=year&value=2027')->assertUnprocessable();
        $this->getJson('/api/bi/sales-chart?period=month&value=2026-11')->assertUnprocessable();
        $this->getJson('/api/bi/sales-chart?period=day&value=2026-10-10')->assertUnprocessable();
    }
}
