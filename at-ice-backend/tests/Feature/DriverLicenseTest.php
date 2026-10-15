<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use App\Services\DriverLicense;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DriverLicenseTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'position' => 'Driver',
            'first_name' => 'Pedro',
            'last_name' => 'Santos',
            'phone' => '+639171234567',
            'street' => 'Quirino Highway',
            'barangay' => 'Muzon',
            'city' => 'San Jose Del Monte',
            'province' => 'Bulacan',
            'daily_rate' => 600,
            'date_hired' => now()->subDay()->toDateString(),
            'shift' => 'day',
            'employment_type' => 'regular',
            'license_expiry' => now()->addYears(5)->toDateString(),
        ];
    }

    public function test_a_driver_needs_a_license_number(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/employees', $this->payload())
            ->assertStatus(422)
            ->assertJsonPath('errors.license_number.0', "Enter the driver's license number.");
    }

    public function test_the_license_number_is_saved_in_the_lto_format_and_is_unique(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/employees', $this->payload(['license_number' => 'n01 23 456789']))->assertCreated();
        $this->assertSame('N01-23-456789', Employee::first()->license_number);

        $this->postJson('/api/employees', $this->payload(['phone' => '+639181234567', 'license_number' => 'N0123456789']))
            ->assertStatus(422)
            ->assertJsonPath('errors.license_number.0', 'Another employee already has this license number.');

        $this->postJson('/api/employees', $this->payload(['phone' => '+639181234567', 'license_number' => '12345']))
            ->assertStatus(422)
            ->assertJsonPath('errors.license_number.0', DriverLicense::MESSAGE);
    }

    public function test_other_positions_do_not_need_or_keep_one(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/employees', $this->payload(['position' => 'Checker', 'license_number' => 'N01-23-456789']))->assertCreated();
        $this->assertNull(Employee::first()->license_number);
    }

    public function test_the_office_number_and_serial_cannot_be_zero(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        foreach (['N00-23-456789', 'N01-23-000000'] as $bad) {
            $this->postJson('/api/employees', $this->payload(['license_number' => $bad]))
                ->assertStatus(422)
                ->assertJsonPath('errors.license_number.0', DriverLicense::MESSAGE);
        }
    }

    public function test_a_driver_needs_a_license_that_has_not_expired(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/employees', $this->payload(['license_number' => 'N01-23-456789', 'license_expiry' => null]))
            ->assertStatus(422)
            ->assertJsonPath('errors.license_expiry.0', "Enter the license's expiry date.");

        $this->postJson('/api/employees', $this->payload(['license_number' => 'N01-23-456789', 'license_expiry' => now()->subDay()->toDateString()]))
            ->assertStatus(422)
            ->assertJsonPath('errors.license_expiry.0', 'This license has expired. A Driver needs a valid license.');

        $this->postJson('/api/employees', $this->payload(['license_number' => 'N01-23-456789', 'license_expiry' => now()->addYears(12)->toDateString()]))
            ->assertStatus(422)
            ->assertJsonPath('errors.license_expiry.0', 'Check the expiry date: an LTO license is valid for at most 10 years.');
    }

    public function test_the_login_email_is_last_name_and_employee_number(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/employees', $this->payload(['last_name' => 'Dela Cruz', 'license_number' => 'N01-23-456789']))
            ->assertCreated()
            ->assertJsonPath('email', 'delacruz.0001@atice.cloud');
    }
}
