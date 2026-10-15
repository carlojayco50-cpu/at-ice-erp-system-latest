<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Review change request, phase 3 (docs/REVIEW-DECISIONS.md): leave is filed
// by the employee, emergency leave in hours, and each approved leave records
// how much was paid from leave credits and how much is unpaid (used by payroll
// and the 13th month). A rejection needs a reason. New med certs are kept on
// the private disk (attachment_disk "local"); older files stay public.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->decimal('hours', 5, 2)->nullable()->after('total_days');
            $table->boolean('is_paid')->nullable()->after('status');
            $table->decimal('paid_days', 5, 2)->default(0)->after('is_paid');
            $table->decimal('unpaid_days', 5, 2)->default(0)->after('paid_days');
            $table->text('reject_reason')->nullable()->after('admin_notes');
            $table->string('attachment_disk', 10)->default('public')->after('attachment_path');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn(['hours', 'is_paid', 'paid_days', 'unpaid_days', 'reject_reason', 'attachment_disk']);
        });
    }
};
