<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Same-day changes to deliveries: an urgent top-up (another delivery to a
// store that already had one today, linked to it) and add/reduce sacks on a
// delivery that is not delivered yet (a rainy day cut). Each change is kept.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->foreignId('parent_delivery_id')->nullable()->constrained('deliveries')->nullOnDelete();
            $table->boolean('is_top_up')->default(false);
        });

        Schema::create('delivery_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->string('kind', 10); // top_up | add | reduce
            $table->string('source', 10)->default('admin'); // admin | customer
            $table->string('reason', 255);
            $table->json('changes'); // [{product_type, before, after}]
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['delivery_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_adjustments');
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_delivery_id');
            $table->dropColumn('is_top_up');
        });
    }
};
