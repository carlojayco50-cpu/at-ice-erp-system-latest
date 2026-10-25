<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A store asks in the portal to change the sacks on one of its deliveries that
// is not delivered yet (rain, slow or fast sales). Admin applies it (a
// delivery_adjustments row) or declines it with a reason (owner, 2026-10-22).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_adjustment_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->json('items'); // [{product_type, before, after}] as asked
            $table->string('reason', 255);
            $table->string('status', 10)->default('pending'); // pending | applied | declined | withdrawn
            $table->string('review_note', 255)->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('adjustment_id')->nullable()->constrained('delivery_adjustments')->nullOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['delivery_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_adjustment_requests');
    }
};
