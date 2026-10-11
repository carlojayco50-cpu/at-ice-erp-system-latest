<?php

namespace Tests\Feature;

use App\Events\PaymentOverdue;
use App\Http\Middleware\EnsureKioskToken;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Employee;
use App\Models\FaceData;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StateRulesTest extends TestCase
{
    use RefreshDatabase;

    private function login(string $email, string $password)
    {
        return $this->postJson('/api/login', ['email' => $email, 'password' => $password]);
    }

    public function test_a_deactivated_employee_can_no_longer_sign_in_or_time_in(): void
    {
        $user = User::create(['name' => 'Ana Cruz', 'email' => 'cruz.ana.0001@atice.cloud', 'password' => 'Secret123!', 'role' => 'employee', 'sub_role' => 'checker']);
        $employee = Employee::create(['user_id' => $user->id, 'employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Cruz', 'position' => 'Checker', 'date_hired' => '2026-01-05', 'is_active' => true]);
        $face = FaceData::create(['worker_name' => 'Ana Cruz', 'role' => 'checker', 'employee_id' => $employee->id, 'descriptor' => array_fill(0, 128, 0.1)]);

        Sanctum::actingAs(User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']));
        $this->deleteJson("/api/employees/{$employee->id}")->assertOk();

        $this->assertFalse($user->fresh()->is_active);
        $this->login('cruz.ana.0001@atice.cloud', 'Secret123!')->assertForbidden();

        $this->withoutMiddleware(EnsureKioskToken::class);
        $this->assertSame([], $this->getJson('/api/face-descriptors')->assertOk()->json());
        $this->postJson('/api/attendances', ['face_data_id' => $face->id, 'type' => 'time_in'])
            ->assertStatus(409)->assertJsonPath('type', 'inactive');
        $this->assertDatabaseCount('attendances', 0);
    }

    public function test_a_removed_customer_can_no_longer_sign_in(): void
    {
        $user = User::create(['name' => 'Alfamart', 'email' => 'alfamart@gmail.com', 'password' => 'Secret123!', 'role' => 'customer']);
        $customer = Customer::create(['user_id' => $user->id, 'name' => 'Alfamart', 'email' => 'alfamart@gmail.com', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);
        $user->createToken('auth_token');

        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
        $this->deleteJson("/api/customers/{$customer->id}")->assertOk();

        $this->assertFalse($user->fresh()->is_active);
        $this->assertSame(0, $user->tokens()->count());
        $this->login('alfamart@gmail.com', 'Secret123!')->assertForbidden();
    }

    public function test_an_overdue_receipt_is_marked_and_announced_once(): void
    {
        Event::fake([PaymentOverdue::class]);
        $user = User::create(['name' => 'Salesman', 'email' => 'sales@atice.cloud', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']);
        $customer = Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);
        $delivery = Delivery::create(['delivery_no' => 'DEL-0001', 'driver_id' => $user->id, 'customer_id' => $customer->id, 'status' => 'delivered', 'scheduled_date' => now()->toDateString(), 'prepared_by' => $user->id]);
        $proof = DeliveryProof::create(['delivery_id' => $delivery->id, 'salesman_id' => $user->id, 'quantity' => 1, 'photo_path' => 'x.jpg', 'confirmed_at' => now()]);
        $receipt = fn ($no, $daysAgo) => tap(Receipt::create([
            'receipt_no' => $no, 'delivery_id' => $delivery->id, 'delivery_proof_id' => $proof->id, 'customer_id' => $customer->id,
            'salesman_id' => $user->id, 'quantity' => 1, 'total_amount' => 100, 'payment_status' => 'unpaid',
        ]), fn ($r) => $r->forceFill(['created_at' => now()->subDays($daysAgo)])->save());
        $old = $receipt('RCP-1', 20);
        $new = $receipt('RCP-2', 3);

        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
        $this->getJson('/api/receipts')->assertOk();
        $this->getJson('/api/receipts/summary')->assertOk()->assertJsonPath('total_overdue', fn ($v) => (float) $v === 100.0);
        $this->getJson('/api/receipts/overdue')->assertOk();

        $this->assertSame('overdue', $old->fresh()->payment_status);
        $this->assertSame('unpaid', $new->fresh()->payment_status);
        Event::assertDispatchedTimes(PaymentOverdue::class, 1);
    }
}
