<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Support\PayPeriod;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Every employee gets a Draft Base Rating from attendance and work done; only
// Admin overrides it and publishes the appraisal (owner, 2026-10-20).
class PerformanceTest extends TestCase
{
    use RefreshDatabase;

    private Employee $guard;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-16 17:00:00', 'Asia/Manila')); // a Friday
        $this->guard = Employee::create(['employee_id' => 'EMP-0101', 'first_name' => 'Gina', 'last_name' => 'Guard', 'position' => 'Guard', 'daily_rate' => 600, 'date_hired' => '2026-01-05', 'is_active' => true]);
        $period = PayPeriod::for('2026-10-16');
        // on time every work day of the period so far, late once
        foreach (\Carbon\CarbonPeriod::create($period['start'], '2026-10-16') as $i => $d) {
            if ($d->isWeekday()) {
                Attendance::create(['employee_id' => $this->guard->id, 'date' => $d->toDateString(), 'time_in' => '08:55:00', 'status' => 'present', 'late_minutes' => $i === 1 ? 5 : 0]);
            }
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_admin_sees_a_draft_rating_and_can_override_and_publish_it(): void
    {
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));

        $row = collect($this->getJson('/api/performance')->assertOk()->json('rows'))->firstWhere('code', 'EMP-0101');
        $this->assertSame(100, (int) $row['attendance_rate']);
        $this->assertLessThan(100, $row['punctuality_rate']);
        $this->assertNotNull($row['base_rating']);
        $this->assertSame('draft', $row['status']);
        $this->assertNull($row['goal_target']); // a Guard has no work goal

        $res = $this->putJson("/api/performance/{$this->guard->id}", ['final_rating' => 3.2, 'remarks' => 'Reliable.', 'publish' => true])->assertOk();
        $this->assertSame(3.2, (float) $res->json('row.rating'));
        $this->assertSame('Satisfactory', $res->json('row.rating_label'));
        $this->assertSame('published', $res->json('row.status'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'performance.published']);
    }

    public function test_only_admin_reads_or_writes_appraisals(): void
    {
        Sanctum::actingAs(User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']));
        $this->getJson('/api/performance')->assertForbidden();
        $this->putJson("/api/performance/{$this->guard->id}", ['final_rating' => 5])->assertForbidden();
    }
}
