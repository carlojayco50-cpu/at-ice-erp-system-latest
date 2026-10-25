<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\LiveEvent;
use App\Models\PaymentProof;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentProofTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $customerUser;

    private Customer $customer;

    private Receipt $receipt;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');

        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']);
        $this->customerUser = User::create(['name' => 'Alfamart Muzon', 'email' => 'alf@example.com', 'password' => 'secret-password', 'role' => 'customer']);
        $this->customer = Customer::create(['name' => 'Alfamart Muzon', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-SJDM-001', 'invoice_code' => 'ALF', 'is_active' => true, 'user_id' => $this->customerUser->id]);
        $this->receipt = $this->invoiceFor($this->customer, 'ALF-20261016-001');
    }

    private function invoiceFor(Customer $customer, string $no, string $status = 'unpaid'): Receipt
    {
        $salesman = User::create(['name' => 'Salesman', 'email' => "sales.{$no}@atice.cloud", 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']);
        $delivery = Delivery::create(['delivery_no' => "DEL-{$no}", 'driver_id' => $salesman->id, 'customer_id' => $customer->id, 'status' => 'delivered', 'scheduled_date' => now()->toDateString(), 'prepared_by' => $salesman->id]);
        $proof = DeliveryProof::create(['delivery_id' => $delivery->id, 'salesman_id' => $salesman->id, 'quantity' => 10, 'photo_path' => 'x.jpg', 'confirmed_at' => now()]);

        return Receipt::create(['receipt_no' => $no, 'delivery_id' => $delivery->id, 'delivery_proof_id' => $proof->id, 'customer_id' => $customer->id, 'salesman_id' => $salesman->id, 'quantity' => 10, 'unit_price' => 50, 'total_amount' => 500, 'payment_status' => $status]);
    }

    private function submit(array $extra = [])
    {
        Sanctum::actingAs($this->customerUser);

        return $this->post("/api/my-receipts/{$this->receipt->id}/payment-proofs", [
            'file' => UploadedFile::fake()->create('gcash.jpg', 100, 'image/jpeg'),
            'method' => 'gcash',
            'reference_no' => '1234 5678 9012',
        ] + $extra, ['Accept' => 'application/json']);
    }

    public function test_customer_submits_a_proof_that_does_not_mark_the_invoice_paid_and_admin_is_notified(): void
    {
        $this->submit()->assertCreated()->assertJsonPath('status', 'pending')->assertJsonMissingPath('file_path');

        $proof = PaymentProof::firstOrFail();
        Storage::disk('local')->assertExists($proof->file_path);
        $this->assertSame('unpaid', $this->receipt->fresh()->payment_status);
        $this->assertTrue(LiveEvent::where('message', 'like', 'Payment proof for Invoice ALF-20261016-001%')->exists());

        // Only one waiting proof per invoice.
        $this->submit()->assertStatus(422);

        // The customer sees it on the invoice and can open their own file.
        $this->getJson('/api/my-receipts')->assertOk()->assertJsonPath('0.payment_proofs.0.status', 'pending');
        $this->get("/api/my-payment-proofs/{$proof->id}/file")->assertOk();
    }

    public function test_admin_approves_a_proof_and_the_invoice_becomes_paid_and_is_audited(): void
    {
        $this->submit();
        $proof = PaymentProof::firstOrFail();

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/payment-proofs?status=pending')->assertOk()->assertJsonPath('pending_count', 1)
            ->assertJsonPath('proofs.0.receipt.receipt_no', 'ALF-20261016-001');
        $this->get("/api/payment-proofs/{$proof->id}/file")->assertOk();

        $this->patchJson("/api/payment-proofs/{$proof->id}/approve")->assertOk()->assertJsonPath('status', 'approved');

        $receipt = $this->receipt->fresh();
        $this->assertSame('paid', $receipt->payment_status);
        $this->assertSame('gcash', $receipt->payment_method);
        $this->assertNotNull($receipt->paid_at);
        $this->assertTrue(DB::table('audit_logs')->where('action', 'invoice.paid_by_proof')->where('subject_id', $receipt->id)->exists());

        // Reviewed once only; a paid invoice takes no more proofs.
        $this->patchJson("/api/payment-proofs/{$proof->id}/reject", ['reason' => 'Wrong amount'])->assertStatus(422);
        $this->submit()->assertStatus(422);
    }

    public function test_admin_rejects_with_a_reason_the_invoice_stays_unpaid_and_the_customer_can_send_again(): void
    {
        $this->submit();
        $proof = PaymentProof::firstOrFail();
        $created = $this->receipt->created_at;

        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/payment-proofs/{$proof->id}/reject")->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->patchJson("/api/payment-proofs/{$proof->id}/reject", ['reason' => 'The reference number does not match.'])
            ->assertOk()->assertJsonPath('status', 'rejected');

        $receipt = $this->receipt->fresh();
        $this->assertSame('unpaid', $receipt->payment_status);
        // The overdue count is not reset: the invoice date is unchanged.
        $this->assertTrue($receipt->created_at->eq($created));
        $this->assertTrue(DB::table('audit_logs')->where('action', 'payment_proof.rejected')->where('subject_id', $proof->id)->exists());
        $this->assertTrue(LiveEvent::where('message', 'like', '%was rejected: The reference number does not match.')->exists());

        // The customer sees the reason and may send a new proof.
        Sanctum::actingAs($this->customerUser);
        $this->getJson('/api/my-receipts')->assertJsonPath('0.payment_proofs.0.reject_reason', 'The reference number does not match.');
        $this->submit()->assertCreated();
        $this->assertSame(2, PaymentProof::count());
    }

    public function test_mark_paid_waits_while_a_proof_is_pending_and_is_audited(): void
    {
        $this->submit();
        $proof = PaymentProof::firstOrFail();

        // While the proof waits, the invoice can only be paid through it.
        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/receipts/{$this->receipt->id}/paid", ['payment_method' => 'cash'])->assertStatus(422);
        $this->assertSame('unpaid', $this->receipt->fresh()->payment_status);

        // Once it is rejected, Admin may mark it paid (e.g. cash collected), audited.
        $this->patchJson("/api/payment-proofs/{$proof->id}/reject", ['reason' => 'Fake receipt.'])->assertOk();
        $this->patchJson("/api/receipts/{$this->receipt->id}/paid", ['payment_method' => 'cash'])->assertOk();
        $this->assertSame('paid', $this->receipt->fresh()->payment_status);
        $this->assertTrue(DB::table('audit_logs')->where('action', 'invoice.marked_paid')->where('subject_id', $this->receipt->id)->exists());
    }

    public function test_a_customer_cannot_send_or_open_proofs_of_another_customers_invoice(): void
    {
        $otherUser = User::create(['name' => 'Puregold', 'email' => 'pg@example.com', 'password' => 'secret-password', 'role' => 'customer']);
        Customer::create(['name' => 'Puregold', 'customer_code' => 'CUST-PUR-001', 'branch_code' => 'PUR-SJDM-001', 'invoice_code' => 'PG', 'is_active' => true, 'user_id' => $otherUser->id]);

        $this->submit();
        $proof = PaymentProof::firstOrFail();

        Sanctum::actingAs($otherUser);
        $this->post("/api/my-receipts/{$this->receipt->id}/payment-proofs", ['file' => UploadedFile::fake()->create('x.jpg', 100, 'image/jpeg')], ['Accept' => 'application/json'])->assertNotFound();
        $this->get("/api/my-payment-proofs/{$proof->id}/file", ['Accept' => 'application/json'])->assertNotFound();
        $this->getJson('/api/payment-proofs')->assertForbidden();
    }

    public function test_the_proof_must_be_a_photo_or_pdf(): void
    {
        Sanctum::actingAs($this->customerUser);
        $this->post("/api/my-receipts/{$this->receipt->id}/payment-proofs", [
            'file' => UploadedFile::fake()->create('notes.txt', 10, 'text/plain'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('file');

        $this->post("/api/my-receipts/{$this->receipt->id}/payment-proofs", [
            'file' => UploadedFile::fake()->create('bank.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('is_pdf', true);
    }

    // There is no chain field (owner, 2026-10-20): the chain comes from the
    // name, a chain sent anyway is ignored, and a blank type is filled in.
    public function test_customer_chain_comes_from_the_name_and_a_blank_type_is_filled_in(): void
    {
        $other = Customer::create(['name' => 'Alfamart Tungko', 'customer_code' => 'CUST-ALF-002', 'branch_code' => 'ALF-SJDM-002', 'invoice_code' => 'ALT', 'is_active' => true, 'email' => 'alfamart.tungko@gmail.com', 'contact_number' => '+639171234567']);
        $contact = ['contact_person' => 'Ana', 'email' => 'alfamart.tungko@gmail.com', 'contact_number' => '+639171234567'];

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/customers/{$other->id}", ['name' => 'Alfamart Tungko', 'customer_type' => '', 'chain' => 'Something Else'] + $contact)
            ->assertOk()->assertJsonPath('chain', 'Alfamart')->assertJsonPath('customer_type', 'convenience_store');
        $this->putJson("/api/customers/{$other->id}", ['name' => 'Aling Nena Store', 'customer_type' => ''] + $contact)
            ->assertOk()->assertJsonPath('chain', null)->assertJsonPath('customer_type', 'dealer');
        $this->putJson("/api/customers/{$other->id}", ['customer_type' => 'spaceship'] + $contact)
            ->assertStatus(422)->assertJsonValidationErrors('customer_type');
    }

    public function test_support_topics_include_the_new_reasons(): void
    {
        // one ticket per topic is allowed; the 3-per-10-minutes limit is tested in SupportTicketTest
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Sanctum::actingAs($this->customerUser);
        foreach (['late_delivery', 'damaged_ice', 'payment_proof', 'staff_conduct', 'other'] as $topic) {
            $this->postJson('/api/my-support-messages', ['topic' => $topic, 'message' => 'Please check this.'])->assertCreated();
        }
        $this->postJson('/api/my-support-messages', ['topic' => 'nonsense', 'message' => 'Please check this.'])->assertStatus(422);
    }
}
