<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receipts', function (Blueprint $table) {
            $table->id();

            // Auto-generated receipt number e.g. RCP-20260606-001
            $table->string('receipt_no')->unique();

            // Links
            $table->foreignId('delivery_id')->constrained('deliveries')->onDelete('cascade');
            $table->foreignId('delivery_proof_id')->constrained('delivery_proofs')->onDelete('cascade');
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');
            $table->foreignId('salesman_id')->constrained('users')->onDelete('cascade');

            // Receipt details
            $table->integer('quantity');           // sacks delivered
            $table->decimal('unit_price', 10, 2);  // price per sack
            $table->decimal('total_amount', 10, 2); // qty × unit_price

            // Payment status
            $table->enum('payment_status', ['unpaid', 'paid', 'overdue'])->default('unpaid');
            $table->enum('payment_method', ['cash', 'gcash', 'check', 'bank_transfer'])->nullable();
            $table->timestamp('paid_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receipts');
    }
};
