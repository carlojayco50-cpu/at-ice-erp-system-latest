<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\LiveEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PublicApplicationTest extends TestCase
{
    use RefreshDatabase;

    private function form(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Maria Clara Reyes',
            'phone' => '0917 123 4567',
            'email' => 'Maria@Example.com',
            'position_applied' => 'Driver',
            'street' => 'Rizal St',
            'barangay' => 'Muzon',
            'barangay_code' => '031420007',
            'city' => 'San Jose Del Monte',
            'province' => 'Bulacan',
            'region' => 'Region III – Central Luzon',
            'notes' => 'May lisensya po ako.',
            'consent' => true,
            'license_number' => 'N01-23-456789',
            'license_expiry' => now()->addYears(2)->toDateString(),
        ];
    }

    public function test_anyone_can_apply_without_signing_in_and_hr_is_told(): void
    {
        $this->postJson('/api/apply', $this->form())->assertCreated();

        $a = Applicant::first();
        $this->assertSame('pending', $a->status);
        $this->assertSame('qr', $a->source);
        $this->assertSame('+639171234567', $a->phone);
        $this->assertSame('maria@example.com', $a->email);
        $this->assertSame('031420007', $a->barangay_code);
        $this->assertSame('From the applicant: May lisensya po ako.', $a->notes);
        $this->assertSame('New application (QR): Maria Clara Reyes for Driver', LiveEvent::first()->message);
    }

    public function test_one_open_application_per_mobile_number(): void
    {
        $this->postJson('/api/apply', $this->form())->assertCreated();

        $this->postJson('/api/apply', $this->form(['name' => 'Someone Else', 'email' => 'someone@example.com']))
            ->assertStatus(422)
            ->assertJsonPath('errors.phone.0', 'You already have an application with this mobile number. HR will contact you.');
    }

    public function test_the_form_is_checked_and_cannot_set_hr_fields(): void
    {
        // an off-list position is refused before anything else is checked
        $this->postJson('/api/apply', $this->form(['position_applied' => 'Manager', 'phone' => '12345']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['position_applied']);
        $this->postJson('/api/apply', $this->form(['phone' => '12345']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->postJson('/api/apply', $this->form(['status' => 'hired', 'interview_date' => '2030-01-01 09:00:00']))->assertCreated();
        $a = Applicant::first();
        $this->assertSame('pending', $a->status);
        $this->assertNull($a->interview_date);
    }

    public function test_a_bot_filling_the_hidden_field_saves_nothing(): void
    {
        $this->postJson('/api/apply', $this->form(['website' => 'http://spam.example']))->assertCreated();
        $this->assertSame(0, Applicant::count());
    }

    public function test_the_resume_is_kept_private_and_only_hr_opens_it(): void
    {
        Storage::fake('local');

        $this->post('/api/apply', $this->form(['resume' => UploadedFile::fake()->create('My Resume.pdf', 300, 'application/pdf')]), ['Accept' => 'application/json'])
            ->assertCreated();

        $a = Applicant::first();
        $this->assertSame('My Resume.pdf', $a->resume_name);
        Storage::disk('local')->assertExists($a->resume_path);
        $this->assertArrayNotHasKey('resume_path', $a->toArray());

        $this->getJson("/api/applicants/{$a->id}/resume")->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create(['role' => 'customer']));
        $this->getJson("/api/applicants/{$a->id}/resume")->assertForbidden();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->get("/api/applicants/{$a->id}/resume")->assertOk()->assertHeader('content-type', 'application/pdf');

        $this->deleteJson("/api/applicants/{$a->id}")->assertOk();
        Storage::disk('local')->assertMissing($a->resume_path);
    }

    public function test_only_pdf_or_word_is_accepted_as_a_resume(): void
    {
        Storage::fake('local');

        foreach (['virus.exe', 'photo.jpg'] as $name) {
            $this->post('/api/apply', $this->form(['resume' => UploadedFile::fake()->create($name, 10)]), ['Accept' => 'application/json'])
                ->assertStatus(422)
                ->assertJsonPath('errors.resume.0', 'Attach your resume as a PDF or a Word file (DOC, DOCX).');
        }

        $this->post('/api/apply', $this->form(['resume' => UploadedFile::fake()->create('big.pdf', 6000, 'application/pdf')]), ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath('errors.resume.0', 'The resume is too large. Use a file up to 5 MB.');
    }

    public function test_nothing_is_kept_without_the_privacy_consent_and_drivers_give_their_license(): void
    {
        $this->postJson('/api/apply', $this->form(['consent' => false]))->assertUnprocessable()->assertJsonValidationErrors('consent');
        $this->postJson('/api/apply', array_diff_key($this->form(), ['license_number' => 1]))->assertUnprocessable()->assertJsonValidationErrors('license_number');
        // other positions need no license
        $this->postJson('/api/apply', array_diff_key($this->form(['position_applied' => 'Bagger']), ['license_number' => 1, 'license_expiry' => 1]))->assertCreated();
        $this->assertDatabaseCount('applicants', 1);
        $this->assertNotNull(Applicant::first()->consented_at);
    }

    public function test_biodata_photo_and_documents_are_kept_private_and_carry_over_when_hired(): void
    {
        Storage::fake('local');
        $this->post('/api/apply', $this->form([
            'birth_date' => '1995-04-12', 'sex' => 'female', 'civil_status' => 'single', 'nationality' => 'Filipino',
            'emergency_name' => 'Ana Reyes', 'emergency_relationship' => 'Mother', 'emergency_phone' => '0918 765 4321',
            'education_level' => 'college_graduate', 'school' => 'BulSU', 'course' => 'BS Business Administration', 'year_graduated' => 2016,
            'work_history' => [['company' => 'Coca-Cola Bulacan', 'position' => 'Driver', 'from' => '2018-01', 'to' => '2024-06'], ['company' => '']],
            'license_restrictions' => ['B', 'B1'],
            'photo' => UploadedFile::fake()->createWithContent('me.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')),
            'documents' => [UploadedFile::fake()->create('nbi.pdf', 100, 'application/pdf')],
        ]), ['Accept' => 'application/json'])->assertCreated();

        $a = Applicant::with('documents')->first();
        $this->assertSame('B,B1', $a->license_restrictions);
        $this->assertCount(1, $a->work_history);
        $this->assertSame('+639187654321', $a->emergency_phone);
        $this->assertEqualsCanonicalizing(['photo', 'other'], $a->documents->pluck('type')->all());

        Sanctum::actingAs(User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']));
        $this->get("/api/applicants/{$a->id}/documents/{$a->documents[0]->id}")->assertOk();

        $employee = $this->postJson('/api/employees', [
            'first_name' => 'Maria Clara', 'last_name' => 'Reyes', 'phone' => '09171234567', 'position' => 'Bagger',
            'street' => 'Rizal St', 'barangay' => 'Muzon', 'city' => 'San Jose Del Monte', 'province' => 'Bulacan',
            'daily_rate' => 600, 'date_hired' => now()->toDateString(), 'shift_start' => '08:00', 'shift_end' => '17:00',
            'employment_type' => 'regular', 'applicant_id' => $a->id,
            'sss_no' => '3412345678', 'tin_no' => '123456789', 'philhealth_no' => '123456789012', 'pagibig_no' => '121234567890',
            'birth_date' => '1995-04-12',
        ])->assertCreated()->json('employee');

        $this->assertSame('34-1234567-8', $employee['sss_no']);
        $this->assertSame('123-456-789-000', $employee['tin_no']);
        $this->assertSame('12-345678901-2', $employee['philhealth_no']);
        $this->assertSame('1212-3456-7890', $employee['pagibig_no']);
        $this->assertCount(2, $this->getJson("/api/employees/{$employee['id']}/documents")->assertOk()->json());
    }
}
