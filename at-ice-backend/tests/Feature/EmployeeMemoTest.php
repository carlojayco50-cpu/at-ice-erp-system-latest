<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeMemo;
use App\Models\LiveEvent;
use App\Models\User;
use App\Support\MemoEngine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeMemoTest extends TestCase
{
    use RefreshDatabase;

    private User $hr;

    private User $driverUser;

    private Employee $driver;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Carbon::setTestNow('2026-10-22 10:00:00');

        $this->hr = User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']);
        $this->driverUser = User::create(['name' => 'Juan Cruz', 'email' => 'cruz.0014@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        $this->driver = Employee::create(['user_id' => $this->driverUser->id, 'employee_id' => 'EMP-0014', 'first_name' => 'Juan', 'last_name' => 'Cruz', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true, 'shift_start' => '07:00', 'shift_end' => '16:00']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function missedTimeOut(string $date): Attendance
    {
        return Attendance::create(['employee_id' => $this->driver->id, 'date' => $date, 'time_in' => '07:00:00', 'status' => 'present']);
    }

    public function test_missed_time_outs_become_escalating_drafts_once_each_and_never_reach_the_employee_on_their_own(): void
    {
        foreach (['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'] as $day) {
            $this->missedTimeOut($day);
        }
        $this->missedTimeOut('2026-10-22'); // still on shift today: no memo yet

        $this->assertSame(4, MemoEngine::run(true));
        $this->assertSame(0, MemoEngine::run(true)); // never twice for the same attendance

        $this->assertSame(['verbal_warning', 'first_written', 'final_written', 'nte'], EmployeeMemo::orderBy('incident_date')->pluck('level')->all());
        $this->assertSame(['draft'], EmployeeMemo::distinct()->pluck('status')->all());
        $this->assertSame(4, $this->driver->fresh()->no_timeout_count);
        $this->assertTrue(LiveEvent::where('message', 'like', 'URGENT: draft Notice to Explain%')->exists());

        Sanctum::actingAs($this->driverUser);
        $this->getJson('/api/my-memos')->assertOk()->assertJsonCount(0);
    }

    public function test_hr_sends_a_warning_the_employee_acknowledges_it(): void
    {
        $this->missedTimeOut('2026-10-20');
        MemoEngine::run(true);
        $memo = EmployeeMemo::first();

        Sanctum::actingAs($this->hr);
        $this->postJson("/api/memos/{$memo->id}/send")->assertOk()->assertJsonPath('status', 'sent');
        $this->assertTrue(LiveEvent::whereJsonContains('user_ids', $this->driverUser->id)->where('module', 'memos')->exists());

        Sanctum::actingAs($this->driverUser);
        $this->getJson('/api/my-memos')->assertOk()->assertJsonPath('0.level', 'verbal_warning');
        $this->postJson("/api/my-memos/{$memo->id}/acknowledge")->assertOk();
        $this->assertNotNull($memo->fresh()->acknowledged_at);
        $this->assertSame(2, DB::table('audit_logs')->whereIn('action', ['memo.send', 'memo.acknowledge'])->count());
    }

    public function test_a_zero_tolerance_memo_is_an_nte_signed_in_person_and_opens_an_investigation(): void
    {
        Sanctum::actingAs($this->hr);
        $memo = $this->post('/api/memos', [
            'employee_id' => $this->driver->id,
            'violation' => 'fuel_theft',
            'level' => 'verbal_warning', // ignored: zero tolerance is always an NTE
            'incident_date' => '2026-10-21',
            'subject' => 'Notice to Explain: Fuel Theft',
            'body' => 'GPS logs show the truck stopped at an unlisted station for 40 minutes.',
            'send' => 1,
            'files' => [UploadedFile::fake()->create('gps-log.pdf', 50, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('level', 'nte')->assertJsonPath('status', 'awaiting_physical')->json();

        $this->assertSame('pending_investigation', $this->driver->fresh()->investigation_status);

        Sanctum::actingAs($this->driverUser);
        $this->postJson("/api/my-memos/{$memo['id']}/acknowledge")->assertStatus(422);
        $this->get("/api/my-memos/{$memo['id']}/files/{$memo['files'][0]['id']}")->assertOk();

        Sanctum::actingAs($this->hr);
        $this->post("/api/memos/{$memo['id']}/files", [
            'kind' => 'signed_copy',
            'files' => [UploadedFile::fake()->create('signed.pdf', 80, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('status', 'archived');
        $this->postJson("/api/memos/{$memo['id']}/close-investigation", ['outcome' => 'Hearing held; 5-day suspension'])->assertOk();
        $this->assertNull($this->driver->fresh()->investigation_status);
    }

    public function test_a_cancelled_draft_does_not_count_toward_the_next_level(): void
    {
        $this->missedTimeOut('2026-10-19');
        MemoEngine::run(true);
        $first = EmployeeMemo::first();

        Sanctum::actingAs($this->hr);
        $this->postJson("/api/memos/{$first->id}/cancel", ['reason' => ''])->assertStatus(422);
        $this->postJson("/api/memos/{$first->id}/cancel", ['reason' => 'Kiosk was offline that evening'])->assertOk();
        $this->assertSame(0, $this->driver->fresh()->no_timeout_count);

        $this->missedTimeOut('2026-10-20');
        MemoEngine::run(true);
        $this->assertSame('verbal_warning', EmployeeMemo::where('status', 'draft')->value('level'));
    }

    public function test_only_hr_manages_memos_and_employees_see_only_their_own(): void
    {
        Sanctum::actingAs($this->driverUser);
        $this->getJson('/api/memos')->assertForbidden();

        $otherUser = User::create(['name' => 'Pedro', 'email' => 'santos.0015@atice.cloud', 'password' => 'secret-password', 'role' => 'driver']);
        Employee::create(['user_id' => $otherUser->id, 'employee_id' => 'EMP-0015', 'first_name' => 'Pedro', 'last_name' => 'Santos', 'position' => 'Driver', 'daily_rate' => 600, 'date_hired' => '2026-01-01', 'is_active' => true]);

        $this->missedTimeOut('2026-10-20');
        MemoEngine::run(true);
        $memo = EmployeeMemo::first();
        Sanctum::actingAs($this->hr);
        $this->postJson("/api/memos/{$memo->id}/send")->assertOk();

        Sanctum::actingAs($otherUser);
        $this->postJson("/api/my-memos/{$memo->id}/acknowledge")->assertNotFound();
    }
}
