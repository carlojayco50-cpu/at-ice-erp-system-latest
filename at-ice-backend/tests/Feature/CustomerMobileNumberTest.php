<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

// Customer contact numbers are Philippine mobile numbers: +63 and 10 digits
// starting with 9. The check is the same when adding and when editing.
class CustomerMobileNumberTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
    }

    private function customer(array $extra = []): Customer
    {
        return Customer::create($extra + [
            'customer_code' => 'CUST-ALF-099', 'name' => 'Alfamart Muzon', 'branch_code' => 'ALF-SJDM-099',
            'address' => 'Muzon, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan',
            'mop' => 'cash', 'is_active' => true,
        ]);
    }

    private function payload(string $number): array
    {
        return [
            'name' => 'Alfamart Muzon', 'mop' => 'cash', 'city' => 'San Jose del Monte', 'province' => 'Bulacan',
            'contact_person' => 'Juan', 'contact_number' => $number, 'email' => '', 'notes' => '',
        ];
    }

    public static function validNumbers(): array
    {
        return [['9171234567'], ['9876543210'], ['9123456789'], ['09171234567'], ['+639171234567']];
    }

    public static function invalidNumbers(): array
    {
        return [
            'not starting with 9' => ['1234567890'],
            'starts with 8' => ['8171234567'],
            'only 9 digits' => ['917123456'],
            '11 digits' => ['91712345678'],
            'letters' => ['91712ABC67'],
            'dashes' => ['917-123-4567'],
            'plus inside' => ['9171+234567'],
            'empty' => [''],
        ];
    }

    #[DataProvider('validNumbers')]
    public function test_a_valid_mobile_number_is_saved_as_plus63(string $number): void
    {
        $c = $this->customer();

        $this->putJson("/api/customers/{$c->id}", $this->payload($number))->assertOk();

        $this->assertSame('+639'.substr(ltrim($number, '+0'), -9), $c->fresh()->contact_number);
    }

    #[DataProvider('invalidNumbers')]
    public function test_an_invalid_number_is_rejected_when_adding(string $number): void
    {
        $this->postJson('/api/customers', $this->payload($number) + ['customer_type' => 'convenience_store'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('contact_number');

        $this->assertSame(0, Customer::count());
    }

    #[DataProvider('invalidNumbers')]
    public function test_an_invalid_number_is_rejected_when_editing(string $number): void
    {
        $c = $this->customer(['contact_number' => '+639171234567', 'contact_person' => 'Juan']);

        $this->putJson("/api/customers/{$c->id}", $this->payload($number))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('contact_number');

        $this->assertSame('+639171234567', $c->fresh()->contact_number);
    }

    public function test_a_saved_landline_stays_editable_until_it_is_changed(): void
    {
        $c = $this->customer(['contact_number' => '+63281234567', 'contact_person' => 'Juan']);

        $this->putJson("/api/customers/{$c->id}", $this->payload('+63281234567') + ['notes' => 'kept'])->assertOk();
        $this->assertSame('+63281234567', $c->fresh()->contact_number);

        $this->putJson("/api/customers/{$c->id}", $this->payload('281234567'))->assertUnprocessable();
    }
}
