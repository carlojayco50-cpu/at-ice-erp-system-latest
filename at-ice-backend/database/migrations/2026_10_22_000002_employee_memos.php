<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Disciplinary memos (HR): automatic drafts for a missed Time Out (verbal
// warning, first written, final written, Notice to Explain), memos HR issues
// by hand (including zero-tolerance offenses), the files HR drops on a memo,
// and the employee's acknowledgment or the scanned wet-signed copy.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->unsignedInteger('no_timeout_count')->default(0);
            $table->string('investigation_status', 30)->nullable(); // pending_investigation
            $table->timestamp('investigation_since')->nullable();
        });

        Schema::create('employee_memos', function (Blueprint $table) {
            $table->id();
            $table->string('memo_no', 30)->unique();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('violation', 40);
            $table->string('category', 20); // attendance | conduct | zero_tolerance
            $table->string('level', 20); // verbal_warning | first_written | final_written | nte
            $table->unsignedTinyInteger('offense_no')->nullable();
            $table->string('status', 30)->default('draft'); // draft | sent | acknowledged | awaiting_physical | archived | cancelled
            $table->string('source', 10)->default('manual'); // auto | manual
            $table->string('subject');
            $table->text('body');
            $table->date('incident_date');
            $table->foreignId('attendance_id')->nullable()->unique()->constrained('attendances')->nullOnDelete();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'violation']);
            $table->index('status');
        });

        Schema::create('employee_memo_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_memo_id')->constrained('employee_memos')->cascadeOnDelete();
            $table->string('kind', 20); // attachment | signed_copy
            $table->string('path');
            $table->string('original_name');
            $table->string('mime', 120)->nullable();
            $table->unsignedInteger('size')->default(0);
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_memo_files');
        Schema::dropIfExists('employee_memos');
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['no_timeout_count', 'investigation_status', 'investigation_since']);
        });
    }
};
