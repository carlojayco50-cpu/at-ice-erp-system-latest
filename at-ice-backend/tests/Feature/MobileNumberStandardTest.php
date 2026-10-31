<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\User;
use App\Services\PhoneFormatter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

// Every mobile number field in AT-ICE (customer contact, employee phone and emergency
// phone, applicant phone, public application) follows the same rule: +63 and 10 digits
// starting with 9. Suppliers keep their own mobile-or-landline rule.
class MobileNumberStandardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
    }

    public static function validNumbers(): array
    {
        return [['9171234567'], ['9876543210'], ['09171234567'], ['+639171234567']];
    }

    public static function invalidNumbers(): array
    {
        return [
            'starts with 1' => ['1234567890'],
            'starts with 8' => ['8171234567'],
            'only 9 digits' => ['917123456'],
            '11 digits' => ['91712345678'],
            'letters' => ['91712ABC67'],
            'dashes' => ['917-123-4567'],
            'spaces' => ['917 123 4567'],
            'brackets' => ['(917)1234567'],
        ];
    }

    private function employee(): Employee
    {
        return Employee::create([
            'employee_id' => 'EMP-001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'name' => 'Juan Dela Cruz',
            'position' => 'Guard', 'status' => 'active', 'date_hired' => now()->subDay()->toDateString(),
        ]);
    }

    public function test_the_shared_helper_accepts_and_rejects_the_same_numbers(): void
    {
        foreach (self::validNumbers() as [$n]) {
            $this->assertSame(1, preg_match(PhoneFormatter::MOBILE_REGEX, PhoneFormatter::mobile($n)), $n);
        }
        foreach (self::invalidNumbers() as $label => [$n]) {
            $this->assertSame(0, preg_match(PhoneFormatter::MOBILE_REGEX, PhoneFormatter::mobile($n)), $label);
        }
    }

    #[DataProvider('invalidNumbers')]
    public function test_every_module_rejects_an_invalid_number(string $n): void
    {
        $e = $this->employee();
        $a = Applicant::create(['name' => 'Maria', 'position_applied' => 'Driver', 'status' => 'pending']);
        $c = Customer::create(['name' => 'Alfamart', 'customer_code' => 'CUST-ALF-001', 'branch_code' => 'ALF-001', 'city' => 'SJDM', 'province' => 'Bulacan', 'is_active' => true]);

        $this->putJson("/api/employees/{$e->id}", ['phone' => $n])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->putJson("/api/employees/{$e->id}", ['emergency_phone' => $n])->assertUnprocessable()->assertJsonValidationErrors('emergency_phone');
        $this->postJson('/api/applicants', ['name' => 'Maria', 'position_applied' => 'Driver', 'phone' => $n])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->putJson("/api/applicants/{$a->id}", ['name' => 'Maria', 'position_applied' => 'Driver', 'phone' => $n])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->postJson('/api/apply', ['name' => 'Maria', 'position_applied' => 'Driver', 'phone' => $n])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->putJson("/api/customers/{$c->id}", ['contact_person' => 'Juan', 'contact_number' => $n])->assertUnprocessable()->assertJsonValidationErrors('contact_number');
        $this->postJson('/api/customers', ['name' => 'Alfamart', 'contact_number' => $n])->assertUnprocessable()->assertJsonValidationErrors('contact_number');
    }

    #[DataProvider('validNumbers')]
    public function test_every_module_saves_a_valid_number_as_plus63(string $n): void
    {
        $e = $this->employee();
        $a = Applicant::create(['name' => 'Maria', 'position_applied' => 'Driver', 'status' => 'pending']);

        $this->putJson("/api/employees/{$e->id}", ['phone' => $n, 'emergency_phone' => $n])->assertOk();
        $this->assertSame('+639'.substr($n, -9), $e->fresh()->phone);
        $this->assertSame('+639'.substr($n, -9), $e->fresh()->emergency_phone);

        $this->postJson('/api/applicants', ['name' => 'Pedro', 'position_applied' => 'Driver', 'phone' => $n])->assertCreated();
        $this->assertSame('+639'.substr($n, -9), Applicant::where('name', 'Pedro')->value('phone'));

        $this->putJson("/api/applicants/{$a->id}", ['name' => 'Maria', 'position_applied' => 'Driver', 'phone' => $n])->assertOk();
        $this->assertSame('+639'.substr($n, -9), $a->fresh()->phone);
    }

    public function test_suppliers_keep_their_landline_rule(): void
    {
        $this->postJson('/api/suppliers', ['name' => 'Ice Plant', 'contact_person' => 'Juan', 'contact_number' => '+63281234567'])->assertCreated();
        $this->postJson('/api/suppliers', ['name' => 'Ice Plant 2', 'contact_person' => 'Juan', 'contact_number' => '12345'])->assertUnprocessable();
    }
}
