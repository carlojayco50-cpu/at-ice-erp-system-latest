<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InterviewScheduleTest extends TestCase
{
    use RefreshDatabase;

    private string $day;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->day = now('Asia/Manila')->addDays(2)->toDateString();
    }

    private function book(string $name, string $time, ?int $minutes = null)
    {
        return $this->postJson('/api/applicants', array_filter([
            'name' => $name,
            'position_applied' => 'Checker',
            'interview_date' => "{$this->day} {$time}:00",
            'interview_minutes' => $minutes,
        ]));
    }

    public function test_interviews_cannot_overlap(): void
    {
        $this->book('Ana Reyes', '09:00', 45)->assertCreated();

        // 9:30 is inside Ana's 9:00-9:45 interview; the next free time is 9:45.
        $this->book('Ben Cruz', '09:30', 30)
            ->assertStatus(422)
            ->assertJsonPath('errors.interview_date.0', "This overlaps Ana Reyes's interview (9:00–9:45 AM). The next free time is ".\Carbon\Carbon::parse($this->day)->format('M j').', 9:45 AM.');

        // A 30-minute interview at 8:30 ends at 9:00, just as Ana's starts.
        $this->book('Ben Cruz', '08:30', 30)->assertCreated();
        $this->book('Cora Lim', '09:45')->assertCreated();
        $this->assertSame(30, Applicant::where('name', 'Cora Lim')->first()->interview_minutes);
    }

    public function test_only_30_or_45_minutes(): void
    {
        $this->book('Ana Reyes', '10:00', 60)
            ->assertStatus(422)
            ->assertJsonPath('errors.interview_minutes.0', 'An interview takes 30 or 45 minutes.');
    }

    public function test_rescheduling_into_another_interview_is_blocked(): void
    {
        $this->book('Ana Reyes', '09:00', 45)->assertCreated();
        $ben = $this->book('Ben Cruz', '13:00')->json('applicant.id');

        $this->putJson("/api/applicants/{$ben}", ['interview_date' => "{$this->day} 09:15:00"])->assertStatus(422);
        // Editing the notes alone keeps the time and is fine.
        $this->putJson("/api/applicants/{$ben}", ['notes' => 'Bring an ID', 'interview_date' => "{$this->day} 13:00:00"])->assertOk();
    }

    public function test_hr_attaches_only_a_pdf_or_word_resume(): void
    {
        Storage::fake('local');

        $this->post('/api/applicants', [
            'name' => 'Ana Reyes', 'position_applied' => 'Checker',
            'resume' => UploadedFile::fake()->create('cv.png', 10, 'image/png'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->post('/api/applicants', [
            'name' => 'Ana Reyes', 'position_applied' => 'Checker',
            'resume' => UploadedFile::fake()->create('cv.docx', 10),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->assertSame('cv.docx', Applicant::first()->resume_name);
    }

    public function test_hr_removes_or_replaces_a_saved_resume(): void
    {
        Storage::fake('local');

        $id = $this->post('/api/applicants', [
            'name' => 'Ana Reyes', 'position_applied' => 'Checker',
            'resume' => UploadedFile::fake()->create('old.pdf', 10, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('applicant.id');
        $old = Applicant::find($id)->resume_path;
        Storage::disk('local')->assertExists($old);

        // A new file replaces the old one, even when remove_resume is sent too.
        $this->post("/api/applicants/{$id}", [
            '_method' => 'PUT', 'remove_resume' => '1',
            'resume' => UploadedFile::fake()->create('new.docx', 10),
        ], ['Accept' => 'application/json'])->assertOk();
        $applicant = Applicant::find($id);
        $this->assertSame('new.docx', $applicant->resume_name);
        Storage::disk('local')->assertMissing($old);
        Storage::disk('local')->assertExists($applicant->resume_path);

        $this->putJson("/api/applicants/{$id}", ['remove_resume' => 'maybe'])->assertStatus(422);

        $this->putJson("/api/applicants/{$id}", ['remove_resume' => true])->assertOk();
        $this->assertNull(Applicant::find($id)->resume_name);
        $this->assertNull(Applicant::find($id)->resume_path);
        Storage::disk('local')->assertMissing($applicant->resume_path);
        $this->assertDatabaseHas('audit_logs', ['action' => 'applicant.resume_removed', 'subject_id' => $id]);
        $this->getJson("/api/applicants/{$id}/resume")->assertNotFound();
    }
}
