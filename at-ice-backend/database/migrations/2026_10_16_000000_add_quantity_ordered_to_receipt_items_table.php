<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // What the delivery asked for, next to the quantity the Salesman delivered.
    // Empty on receipts made before this column existed.
    public function up(): void
    {
        Schema::table('receipt_items', function (Blueprint $table) {
            $table->integer('quantity_ordered')->nullable()->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('receipt_items', function (Blueprint $table) {
            $table->dropColumn('quantity_ordered');
        });
    }
};
