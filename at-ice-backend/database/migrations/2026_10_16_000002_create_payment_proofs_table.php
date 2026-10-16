<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Proof of payment a customer uploads for an unpaid or overdue invoice (a photo
// or PDF of the bank or GCash receipt). It does not mark the invoice paid:
// Admin approves it (invoice paid) or rejects it with a reason.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_proofs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receipt_id')->constrained('receipts')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('file_path');
            $table->string('file_disk', 20)->default('local');
            $table->string('original_name')->nullable();
            $table->string('method', 30)->nullable();
            $table->string('reference_no', 100)->nullable();
            $table->string('status', 20)->default('pending'); // pending | approved | rejected
            $table->text('reject_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_proofs');
    }
};
