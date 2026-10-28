<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Payroll;
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

    /** @return array<int, array{string, string}> */
    private function payrollCalls(int $payrollId, int $adjustmentId): array
    {
        return [
            ['GET', '/api/payroll-records?date=2026-10-14'],
            ['GET', "/api/payrolls/{$payrollId}/payslip"],
            ['POST', "/api/payrolls/{$payrollId}/adjustments"],
            ['DELETE', "/api/payroll-adjustments/{$adjustmentId}"],
            ['POST', '/api/payrolls/mark-paid'],
            ['GET', '/api/thirteenth-month'],
            ['GET', '/api/payrolls'],
            ['GET', '/api/payroll-periods'],
            ['GET', '/api/pay-period?date=2026-10-14'],
            ['GET', '/api/timesheets?date=2026-10-14'],
            ['POST', '/api/timesheets/approve'],
        ];
    }

    private function payrollWithAdjustment(): array
    {
        $employee = Employee::create(['employee_id' => 'EMP-0002', 'first_name' => 'Ben', 'last_name' => 'Cruz', 'position' => 'Guard', 'daily_rate' => 700, 'date_hired' => '2026-01-05', 'is_active' => true]);
        $payroll = Payroll::create(['employee_id' => $employee->id, 'period_start' => '2026-10-01', 'period_end' => '2026-10-14', 'gross_pay' => 5000, 'net_pay' => 4500, 'status' => 'unpaid', 'prepared_by' => User::factory()->create(['role' => 'hr'])->id]);
        $adjustment = $payroll->adjustments()->create(['label' => 'Referral bonus', 'amount' => 100, 'taxable' => false]);

        return [$payroll->id, $adjustment->id];
    }

    // Payroll Records are HR only (owner decision): HR works, Admin and every other
    // role is refused, and a signed-out caller gets 401.
    public function test_payroll_endpoints_are_hr_only(): void
    {
        [$payrollId, $adjustmentId] = $this->payrollWithAdjustment();
        $body = ['label' => 'Bonus', 'amount' => 50, 'taxable' => false, 'ids' => [$payrollId]];

        foreach ($this->payrollCalls($payrollId, $adjustmentId) as [$method, $uri]) {
            $this->json($method, $uri, $body)->assertUnauthorized();
        }

        $others = [
            ['admin', null], ['employee', 'checker'], ['employee', 'salesman'], ['employee', 'maintenance'],
            ['employee', null], ['driver', null], ['customer', null],
        ];
        $bad = [];
        foreach ($others as [$role, $sub]) {
            Sanctum::actingAs(User::factory()->create(['role' => $role, 'sub_role' => $sub, 'is_active' => true]));
            foreach ($this->payrollCalls($payrollId, $adjustmentId) as [$method, $uri]) {
                $status = $this->json($method, $uri, $body)->getStatusCode();
                if ($status !== 403) {
                    $bad[] = "$role/$sub $method $uri -> $status";
                }
            }
        }
        $this->assertSame([], $bad, "Payroll endpoints reachable by a non-HR role:\n".implode("\n", $bad));
        $this->assertSame('unpaid', Payroll::find($payrollId)->status);
        $this->assertDatabaseHas('payroll_adjustments', ['id' => $adjustmentId]);
    }

    public function test_hr_can_use_every_payroll_endpoint_and_admin_keeps_other_admin_pages(): void
    {
        [$payrollId, $adjustmentId] = $this->payrollWithAdjustment();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr', 'is_active' => true]));
        $this->getJson('/api/payroll-records?date=2026-10-14')->assertOk();
        $this->getJson("/api/payrolls/{$payrollId}/payslip")->assertOk();
        $this->postJson("/api/payrolls/{$payrollId}/adjustments", ['label' => 'Bonus', 'amount' => 50, 'taxable' => false])->assertCreated();
        $this->deleteJson("/api/payroll-adjustments/{$adjustmentId}")->assertOk();
        $this->getJson('/api/thirteenth-month?year=2026')->assertOk();
        $this->postJson('/api/payrolls/mark-paid', ['ids' => [$payrollId]])->assertOk();
        $this->assertSame('paid', Payroll::find($payrollId)->status);
        $this->getJson('/api/payrolls')->assertOk();
        $this->getJson('/api/payroll-periods')->assertOk();
        $this->getJson('/api/pay-period?date=2026-10-14')->assertOk();
        $this->getJson('/api/timesheets?date=2026-10-14')->assertOk();
        $this->postJson('/api/timesheets/approve', ['date' => '2026-10-14', 'employee_ids' => [Employee::first()->id]])->assertOk();

        // Admin is refused payroll but still passes the admin-only and HR pages that are not payroll.
        Sanctum::actingAs(User::factory()->create(['role' => 'admin', 'is_active' => true]));
        $this->getJson('/api/payroll-records?date=2026-10-14')->assertForbidden();
        $this->getJson('/api/pay-multipliers')->assertOk();
        $this->getJson('/api/holidays')->assertOk();
    }
}
