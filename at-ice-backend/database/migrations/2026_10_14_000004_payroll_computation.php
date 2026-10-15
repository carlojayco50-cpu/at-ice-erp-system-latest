<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Review change request, phase 4 (docs/REVIEW-DECISIONS.md): payroll is worked
// out by the server (App\Support\PayrollCalculator) when HR approves an
// employee's timesheet for a pay period; Admin processes the pay. The status is
// "unpaid" (approved, waiting for pay) or "paid"; the old "pending" is gone.
// Each line of the payslip is kept, plus earnings adjustments (bonus,
// incentive, referral bonus), each taxable or not.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->string('status', 10)->default('unpaid')->change();
        });
        DB::table('payrolls')->whereIn('status', ['pending', 'approved'])->update(['status' => 'unpaid']);

        Schema::table('payrolls', function (Blueprint $table) {
            $table->date('pay_day')->nullable()->after('period_end');
            $table->string('pay_basis', 10)->default('daily')->after('daily_rate');
            $table->decimal('monthly_rate', 10, 2)->nullable()->after('pay_basis');
            $table->decimal('hourly_rate', 10, 2)->default(0)->after('monthly_rate');
            $table->decimal('days_present', 5, 2)->default(0)->after('days_worked');
            $table->decimal('absent_days', 5, 2)->default(0)->after('days_present');
            $table->unsignedInteger('late_minutes')->default(0)->after('absent_days');
            $table->decimal('paid_leave_days', 5, 2)->default(0)->after('late_minutes');
            $table->decimal('unpaid_leave_days', 5, 2)->default(0)->after('paid_leave_days');
            $table->decimal('unpaid_leave_hours', 6, 2)->default(0)->after('unpaid_leave_days');
            $table->decimal('basic_pay', 10, 2)->default(0)->after('hourly_rate');
            $table->decimal('paid_leave_pay', 10, 2)->default(0)->after('basic_pay');
            $table->decimal('late_deduction', 10, 2)->default(0)->after('paid_leave_pay');
            $table->decimal('absence_deduction', 10, 2)->default(0)->after('late_deduction');
            $table->decimal('leave_deduction', 10, 2)->default(0)->after('absence_deduction');
            $table->decimal('adjustments_total', 10, 2)->default(0)->after('leave_deduction');
            $table->decimal('taxable_income', 10, 2)->default(0)->after('tax_deduction');
            $table->foreignId('timesheet_approved_by')->nullable()->after('prepared_by')->constrained('users')->nullOnDelete();
            $table->timestamp('timesheet_approved_at')->nullable()->after('timesheet_approved_by');
            $table->foreignId('paid_by')->nullable()->after('paid_at')->constrained('users')->nullOnDelete();
        });

        Schema::create('payroll_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_id')->constrained('payrolls')->cascadeOnDelete();
            $table->string('label', 100); // e.g. Bonus, Incentive, Referral bonus
            $table->decimal('amount', 10, 2);
            $table->boolean('taxable')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_adjustments');
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropConstrainedForeignId('paid_by');
            $table->dropConstrainedForeignId('timesheet_approved_by');
            $table->dropColumn([
                'pay_day', 'pay_basis', 'monthly_rate', 'hourly_rate', 'days_present', 'absent_days', 'late_minutes',
                'paid_leave_days', 'unpaid_leave_days', 'unpaid_leave_hours', 'basic_pay', 'paid_leave_pay', 'late_deduction',
                'absence_deduction', 'leave_deduction', 'adjustments_total', 'taxable_income', 'timesheet_approved_at',
            ]);
        });
    }
};
