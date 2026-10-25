<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Review change request, phase 5: one application per email, possible
// duplicates flagged, referral recorded (docs/REVIEW-DECISIONS.md).
class ApplicantDuplicatesTest extends TestCase
{
    use RefreshDatabase;

    private function form(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Maria Clara Reyes', 'phone' => '09171234567', 'email' => 'maria@example.com', 'position_applied' => 'Driver',
            'street' => 'Rizal St', 'barangay' => 'Muzon', 'city' => 'San Jose Del Monte', 'province' => 'Bulacan',
            'consent' => true, 'license_number' => 'N01-23-456789', 'license_expiry' => now()->addYears(2)->toDateString(),
        ];
    }

    public function test_one_application_per_email_lower_cased_and_trimmed_on_every_entry_point(): void
    {
        $this->postJson('/api/apply', $this->form())->assertCreated();

        $this->postJson('/api/apply', $this->form(['email' => '  MARIA@Example.com ', 'phone' => '09181234567']))
            ->assertStatus(422)->assertJsonPath('errors.email.0', 'You already applied with this email. HR will contact you.');

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->postJson('/api/applicants', ['name' => 'Maria C. Reyes', 'position_applied' => 'Driver', 'email' => 'Maria@Example.COM'])
            ->assertStatus(422)->assertJsonPath('errors.email.0', Applicant::EMAIL_TAKEN);

        $this->postJson('/api/applicants', ['name' => 'Ben Cruz', 'position_applied' => 'Guard', 'email' => ' Ben@Gmail.com'])->assertCreated();
        $this->assertSame('ben@gmail.com', Applicant::where('name', 'Ben Cruz')->value('email'));

        // Editing keeps its own email
        $ben = Applicant::where('name', 'Ben Cruz')->first();
        $this->putJson("/api/applicants/{$ben->id}", ['email' => 'ben@gmail.com', 'notes' => 'ok'])->assertOk();
        $this->putJson("/api/applicants/{$ben->id}", ['email' => 'maria@example.com'])->assertStatus(422);
    }

    public function test_same_name_and_address_with_another_email_is_flagged_not_blocked(): void
    {
        $this->postJson('/api/apply', $this->form())->assertCreated();
        $this->postJson('/api/apply', $this->form(['email' => 'maria.reyes@gmail.com', 'phone' => '09181234567', 'name' => 'maria clara  REYES ']))->assertCreated();
        $this->postJson('/api/apply', $this->form(['email' => 'other@example.com', 'phone' => '09191234567', 'name' => 'Pedro Santos']))->assertCreated();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $list = collect($this->getJson('/api/applicants')->assertOk()->json())->keyBy('email');

        $this->assertSame('maria.reyes@gmail.com', $list['maria@example.com']['possible_duplicates'][0]['email']);
        $this->assertArrayHasKey('created_at', $list['maria@example.com']['possible_duplicates'][0]);
        $this->assertSame('maria@example.com', $list['maria.reyes@gmail.com']['possible_duplicates'][0]['email']);
        $this->assertSame([], $list['other@example.com']['possible_duplicates']);
    }

    public function test_the_referral_link_records_the_employee_only(): void
    {
        $emp = Employee::create([
            'employee_id' => 'EMP-0007', 'first_name' => 'Ana', 'last_name' => 'Cruz', 'position' => 'Checker', 'daily_rate' => 600,
            'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => true,
        ]);
        $this->postJson('/api/apply', $this->form(['referral' => 'emp-0007']))->assertCreated();
        $this->postJson('/api/apply', $this->form(['referral' => 'EMP-9999', 'email' => 'x@example.com', 'phone' => '09181234567']))->assertCreated();

        $this->assertSame($emp->id, Applicant::where('email', 'maria@example.com')->value('referred_by_employee_id'));
        $this->assertNull(Applicant::where('email', 'x@example.com')->value('referred_by_employee_id')); // unknown ID: not recorded

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/applicants')->assertJsonFragment(['employee_id' => 'EMP-0007']);
    }
}
