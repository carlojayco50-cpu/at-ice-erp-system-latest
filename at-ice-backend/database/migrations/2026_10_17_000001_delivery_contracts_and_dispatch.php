<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Contract-based delivery schedules (owner decision 2026-10-17):
//   delivery_contracts        one schedule per customer (a whole chain such as SM,
//                             or one store): date range + delivery days. Admin
//                             approves it and the daily deliveries are generated.
//   delivery_contract_stores  the stores (customers rows) the contract covers
//   driver_store_assignments  which Driver handles which store, from a date (Admin)
//   driver_leaves             a Driver who is absent, on emergency leave or on a
//                             rest day; their pending deliveries that day are
//                             reassigned at random to an available Driver
//   delivery_notifications    "your delivery may be late" notices to the store
// deliveries gets contract_id, ordered_at (LIFO queue), reassigned_from_driver_id,
// a nullable driver_id (a queued delivery has no driver yet) and a "queued" status.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_contracts', function (Blueprint $table) {
            $table->id();
            $table->string('contract_no', 20)->unique();
            $table->string('name', 150);
            $table->string('chain', 100)->nullable();
            $table->date('start_date');
            $table->date('end_date');
            $table->json('delivery_days'); // ["mon","tue",...]
            $table->time('delivery_time')->default('08:00:00');
            $table->json('items'); // [{"product_type":"bags","quantity":10}]
            $table->string('status', 20)->default('pending'); // pending | approved | cancelled
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'start_date', 'end_date']);
        });

        Schema::create('delivery_contract_stores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_contract_id')->constrained('delivery_contracts')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->unique(['delivery_contract_id', 'customer_id'], 'contract_store_unique');
        });

        Schema::create('driver_store_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('customers')->cascadeOnDelete();
            $table->date('effective_from');
            $table->date('effective_to')->nullable(); // null = until changed
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['store_id', 'effective_from']);
            $table->index(['driver_id', 'effective_from']);
        });

        Schema::create('driver_leaves', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            $table->string('type', 20); // absent | emergency | rest_day
            $table->string('reason', 255)->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['driver_id', 'date']);
        });

        Schema::create('delivery_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->string('channel', 10); // portal | email | sms
            $table->string('message', 255);
            $table->timestamp('sent_at');
            $table->timestamps();
            $table->unique(['delivery_id', 'channel']);
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->string('status', 20)->default('pending')->change();
            $table->unsignedBigInteger('driver_id')->nullable()->change();
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->foreignId('contract_id')->nullable()->after('id')->constrained('delivery_contracts')->nullOnDelete();
            $table->timestamp('ordered_at')->nullable()->after('scheduled_date');
            $table->foreignId('reassigned_from_driver_id')->nullable()->after('driver_id')->constrained('users')->nullOnDelete();
            $table->text('cancel_reason')->nullable()->after('notes');
            $table->index(['scheduled_date', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropIndex(['scheduled_date', 'status']);
            $table->dropConstrainedForeignId('contract_id');
            $table->dropConstrainedForeignId('reassigned_from_driver_id');
            $table->dropColumn(['ordered_at', 'cancel_reason']);
        });

        Schema::dropIfExists('delivery_notifications');
        Schema::dropIfExists('driver_leaves');
        Schema::dropIfExists('driver_store_assignments');
        Schema::dropIfExists('delivery_contract_stores');
        Schema::dropIfExists('delivery_contracts');
    }
};
