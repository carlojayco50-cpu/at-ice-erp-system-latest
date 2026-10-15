<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Employee;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConcurrencyGuardsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_stock_movement_is_applied_once_even_when_confirmed_twice(): void
    {
        $product = Product::create(['product_code' => 'SUP-001', 'name' => 'Plastic Bags', 'unit' => 'pack', 'current_stock' => 10, 'minimum_stock' => 1]);
        $checker = User::create(['name' => 'Checker', 'email' => 'checker@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'checker']);
        $other = User::create(['name' => 'Checker 2', 'email' => 'checker2@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'checker']);
        $movement = StockMovement::create([
            'product_id' => $product->id, 'type' => 'stock_in', 'quantity' => 5,
            'stock_before' => 10, 'stock_after' => 10, 'status' => 'pending', 'entered_by' => $checker->id,
        ]);

        // A Checker saves only after timing in at the kiosk.
        $emp = Employee::create(['user_id' => $other->id, 'employee_id' => 'EMP-0002', 'first_name' => 'Checker', 'last_name' => 'Two', 'position' => 'Checker', 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true]);
        Attendance::create(['employee_id' => $emp->id, 'date' => now()->toDateString(), 'time_in' => now()->subMinutes(5)->format('H:i:s'), 'status' => 'present']);

        Sanctum::actingAs($other);
        $this->putJson("/api/stock-movements/{$movement->id}/confirm")->assertOk();
        $this->putJson("/api/stock-movements/{$movement->id}/confirm")->assertUnprocessable();
        $this->putJson("/api/stock-movements/{$movement->id}/cancel")->assertUnprocessable();

        $this->assertSame(15, (int) $product->fresh()->current_stock);
        $this->assertSame('confirmed', $movement->fresh()->status);
    }

    public function test_a_receipt_number_is_never_reused_after_a_gap(): void
    {
        $prefix = 'ALF-'.now()->format('Ymd').'-';
        // Today's receipts 001 and 003 exist (002 is missing): a count would
        // give 003 again, the next number must be 004.
        $user = User::create(['name' => 'Salesman', 'email' => 'sales@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']);
        $customer = Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'invoice_code' => 'ALF', 'is_active' => true]);
        $delivery = Delivery::create([
            'delivery_no' => 'DEL-0001', 'driver_id' => $user->id, 'customer_id' => $customer->id,
            'status' => 'delivered', 'scheduled_date' => now()->toDateString(), 'prepared_by' => $user->id,
        ]);
        $proof = DeliveryProof::create(['delivery_id' => $delivery->id, 'salesman_id' => $user->id, 'quantity' => 1, 'photo_path' => 'x.jpg', 'confirmed_at' => now()]);
        foreach (['001', '003'] as $n) {
            Receipt::create([
                'receipt_no' => $prefix.$n, 'delivery_id' => $delivery->id, 'delivery_proof_id' => $proof->id, 'customer_id' => $customer->id,
                'salesman_id' => $user->id, 'quantity' => 1, 'total_amount' => 0, 'payment_status' => 'unpaid',
            ]);
        }

        $this->assertSame($prefix.'004', Receipt::generateReceiptNo($customer));
    }
}
