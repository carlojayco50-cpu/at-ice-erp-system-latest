<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FaceData;
use App\Models\User;
use App\Support\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3 archive expiry (archive.expiry_action): inactive employees past the
// retention period are left for Admin (REVIEW), anonymized or purged, once a
// day from the live-feed poll or with php artisan archive:expire.
class ArchiveExpiryTest extends TestCase
{
    use RefreshDatabase;

    private Employee $old;

    private Employee $recent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 15)->setTime(9, 0));
        $base = ['position' => 'Guard', 'daily_rate' => 500, 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => false];
        $this->old = Employee::create($base + ['employee_id' => 'EMP-0100', 'first_name' => 'Old', 'last_name' => 'Timer', 'phone' => '09171234567',
            'city' => 'San Jose del Monte', 'date_hired' => '2020-01-06', 'deactivated_at' => '2024-01-10']);
        $this->recent = Employee::create($base + ['employee_id' => 'EMP-0101', 'first_name' => 'New', 'last_name' => 'Leaver',
            'date_hired' => '2025-01-06', 'deactivated_at' => '2026-05-01']);
        FaceData::create(['worker_name' => 'Old Timer', 'role' => 'guard', 'employee_id' => $this->old->id, 'descriptor' => array_fill(0, 128, 0.1)]);
        Attendance::create(['employee_id' => $this->old->id, 'date' => '2023-03-01', 'time_in' => '08:55:00', 'status' => 'present']);
    }

    private function poll(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson('/api/live-feed')->assertOk();
    }

    public function test_review_changes_nothing(): void
    {
        $this->poll();
        $this->artisan('archive:expire')->assertSuccessful();
        $this->assertSame('Old', $this->old->fresh()->first_name);
        $this->assertSame(0, DB::table('audit_logs')->count());
    }

    public function test_anonymize_removes_personal_details_and_keeps_the_record(): void
    {
        Settings::set('archive.expiry_action', 'ANONYMIZE');
        $this->poll();
        $old = $this->old->fresh();
        $this->assertNotNull($old->anonymized_at);
        $this->assertSame('EMP-0100', $old->employee_id);
        $this->assertSame('Former', $old->first_name);
        $this->assertNull($old->phone);
        $this->assertNull($old->city);
        $this->assertSame(0, FaceData::count());
        $this->assertSame(1, Attendance::count());
        $this->assertSame('New', $this->recent->fresh()->first_name); // inactive under 2 years
        $this->assertDatabaseHas('audit_logs', ['action' => 'retention.anonymized', 'subject_id' => $this->old->id]);

        // Once a day: a second poll does nothing more; the review list is empty
        $this->poll();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'retention.anonymized')->count());
        $this->assertSame([], $this->getJson('/api/retention-review')->json('employees'));
    }

    public function test_purge_deletes_the_employee_and_their_records(): void
    {
        Settings::set('archive.expiry_action', 'PURGE');
        $this->artisan('archive:expire')->expectsOutputToContain('PURGE: 1')->assertSuccessful();
        $this->assertNull(Employee::find($this->old->id));
        $this->assertSame(0, Attendance::count());
        $this->assertNotNull(Employee::find($this->recent->id));
        $this->assertDatabaseHas('audit_logs', ['action' => 'retention.deleted']);
    }

    public function test_a_kept_employee_is_not_touched_and_admin_can_anonymize_by_hand(): void
    {
        Settings::set('archive.expiry_action', 'PURGE');
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson('/api/retention-review/keep', ['kind' => 'employee', 'ref' => $this->old->id])->assertOk();
        $this->artisan('archive:expire')->assertSuccessful();
        $this->assertNotNull(Employee::find($this->old->id));

        $this->postJson('/api/retention-review/anonymize', ['kind' => 'employee', 'ref' => $this->recent->id])->assertOk();
        $this->assertNotNull($this->recent->fresh()->anonymized_at);
    }
}
