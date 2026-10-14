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
        $this->postJson('/api/apply', $this->form(['position_applied' => 'Manager', 'phone' => '12345']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['position_applied', 'phone']);

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
}
