<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use App\Support\PayPeriod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3 payroll page rules: no month filter, no totals or summary, no "Pending"
// status and no notes, in the API and on the HR pages.
class PayrollPageRulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_payroll_records_api_has_no_totals_and_only_unpaid_or_paid(): void
    {
        $this->travelTo(now('Asia/Manila')->setDate(2026, 10, 15)->setTime(9, 0));
        Employee::create(['employee_id' => 'EMP-0001', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'position' => 'Guard', 'daily_rate' => 700,
            'date_hired' => '2026-01-05', 'employment_type' => 'regular', 'shift' => 'day', 'is_active' => true]);
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $res = $this->getJson('/api/payroll-records?date=2026-10-15')->assertOk();
        $this->assertEqualsCanonicalizing(['period', 'gov_share', 'gov_strategy', 'rows'], array_keys($res->json()));
        $this->getJson('/api/payroll-records?status=pending')->assertStatus(422);
        $this->getJson('/api/payroll-records?month=2026-10')->assertOk()->assertJsonPath('period.start', PayPeriod::for('2026-10-15')['start']);
    }

    public function test_payroll_pages_have_no_month_filter_totals_pending_or_notes(): void
    {
        $pages = [
            base_path('../at-ice-frontend/src/pages/hr/PayrollRecordsPage.jsx'),
            base_path('../at-ice-frontend/src/pages/hr/TimesheetsPage.jsx'),
        ];
        if (! is_file($pages[0])) {
            $this->markTestSkipped('The frontend source is not next to the backend here.');
        }
        foreach ($pages as $file) {
            $src = file_get_contents($file);
            $name = basename($file);
            $this->assertDoesNotMatchRegularExpression('/type="month"/', $src, "$name has a month filter");
            $this->assertDoesNotMatchRegularExpression('/>\s*Total|Total (pay|net|gross)|Grand total/i', $src, "$name shows a total");
            $this->assertDoesNotMatchRegularExpression('/["\']pending["\']|>Pending</', $src, "$name has a Pending status");
            $this->assertDoesNotMatchRegularExpression('/\bnotes\b/i', $src, "$name shows payroll notes");
        }
    }

    public function test_only_hr_and_admin_can_open_payroll_records(): void
    {
        foreach (['employee', 'driver', 'customer'] as $role) {
            Sanctum::actingAs(User::factory()->create(['role' => $role]));
            $this->getJson('/api/payroll-records')->assertForbidden();
            $this->getJson('/api/thirteenth-month')->assertForbidden();
            $this->postJson('/api/payrolls/mark-paid', ['ids' => [1]])->assertForbidden();
        }
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson('/api/payroll-records')->assertOk();
    }
}
