<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Old customers (like the seeded ones) have no email, contact person or contact
// number. They must stay editable. The three are required when a customer is
// added, and when editing only for a field that is being changed.
class CustomerLegacyEditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
    }

    // A customer as CustomerSeeder makes it: only the one-line address.
    private function legacy(array $extra = []): Customer
    {
        return Customer::create($extra + [
            'customer_code' => 'CUST-ALF-099', 'name' => 'Alfamart Muzon', 'branch_code' => 'ALF-SJDM-099',
            'address' => 'Muzon, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan',
            'mop' => 'bank_transfer', 'is_active' => true,
        ]);
    }

    // What the Edit Customer form sends for a customer with those fields empty.
    private function formPayload(array $extra = []): array
    {
        return $extra + [
            'name' => 'Alfamart Muzon', 'mop' => 'cash', 'city' => 'San Jose del Monte', 'province' => 'Bulacan',
            'contact_person' => '', 'contact_number' => '', 'email' => '', 'notes' => '',
        ];
    }

    public function test_an_old_customer_without_contact_details_can_still_be_edited(): void
    {
        $c = $this->legacy();

        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['notes' => 'changed the payment method only']))
            ->assertOk()
            ->assertJsonPath('mop', 'cash');

        $this->assertSame('cash', $c->fresh()->mop);
        $this->assertNull($c->fresh()->email);
        $this->assertNull($c->fresh()->contact_number);
    }

    public function test_an_old_customer_can_gain_contact_details_and_they_are_checked(): void
    {
        $c = $this->legacy();

        // a changed field must be valid
        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['contact_number' => '12ab']))->assertUnprocessable()->assertJsonValidationErrors('contact_number');
        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['email' => 'not an email']))->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['email' => 'someone@no-such-user.example']))->assertUnprocessable()->assertJsonValidationErrors('email');
        // a company address is not a customer's own mailbox
        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['email' => 'muzon@atice.cloud']))->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->putJson("/api/customers/{$c->id}", $this->formPayload([
            'contact_person' => 'Juan Dela Cruz', 'contact_number' => '09171234567', 'email' => 'muzon@gmail.com',
        ]))->assertOk();

        $fresh = $c->fresh();
        $this->assertSame('Juan Dela Cruz', $fresh->contact_person);
        $this->assertSame('+639171234567', $fresh->contact_number);
        $this->assertSame('muzon@gmail.com', $fresh->email);
    }

    public function test_a_changed_email_cannot_take_another_customers_email(): void
    {
        $this->legacy(['customer_code' => 'CUST-ALF-098', 'branch_code' => 'ALF-SJDM-098', 'email' => 'taken@gmail.com']);
        $c = $this->legacy();

        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['email' => 'taken@gmail.com']))
            ->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_a_value_that_exists_cannot_be_emptied(): void
    {
        $c = $this->legacy(['contact_person' => 'Juan', 'contact_number' => '+639171234567', 'email' => 'muzon@gmail.com']);

        $this->putJson("/api/customers/{$c->id}", $this->formPayload([
            'contact_person' => '', 'contact_number' => '+639171234567', 'email' => 'muzon@gmail.com',
        ]))->assertUnprocessable()->assertJsonValidationErrors('contact_person');

        $this->putJson("/api/customers/{$c->id}", $this->formPayload([
            'contact_person' => 'Juan', 'contact_number' => '', 'email' => 'muzon@gmail.com',
        ]))->assertUnprocessable()->assertJsonValidationErrors('contact_number');

        $this->putJson("/api/customers/{$c->id}", $this->formPayload([
            'contact_person' => 'Juan', 'contact_number' => '+639171234567', 'email' => '',
        ]))->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_a_saved_value_that_is_not_changed_is_not_checked_again(): void
    {
        // an old-format number and an email that no longer passes today's check
        $c = $this->legacy(['contact_person' => 'Juan', 'contact_number' => '8123456', 'email' => 'old@no-such-user.example']);

        $this->putJson("/api/customers/{$c->id}", $this->formPayload([
            'contact_person' => 'Juan', 'contact_number' => '8123456', 'email' => 'old@no-such-user.example', 'mop' => 'gcash',
        ]))->assertOk();

        $this->assertSame('gcash', $c->fresh()->mop);
        $this->assertSame('8123456', $c->fresh()->contact_number);
    }

    public function test_adding_a_customer_still_requires_all_three(): void
    {
        $this->postJson('/api/customers', [
            'name' => 'Alfamart Amparo', 'mop' => 'cash',
            'street' => 'Makabud Street', 'barangay' => 'Barangay 183', 'city' => 'Caloocan', 'province' => 'Metro Manila',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'contact_person', 'contact_number']);
    }

    public function test_city_and_province_cannot_be_emptied(): void
    {
        $c = $this->legacy();

        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['city' => '']))->assertUnprocessable()->assertJsonValidationErrors('city');
        $this->putJson("/api/customers/{$c->id}", $this->formPayload(['province' => '']))->assertUnprocessable()->assertJsonValidationErrors('province');

        $this->assertSame('San Jose del Monte', $c->fresh()->city);
        $this->assertSame('Bulacan', $c->fresh()->province);
    }
}
