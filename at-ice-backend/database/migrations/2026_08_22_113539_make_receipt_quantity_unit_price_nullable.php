<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->integer('quantity')->nullable()->change();
            $table->decimal('unit_price', 8, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->integer('quantity')->nullable(false)->change();
            $table->decimal('unit_price', 8, 2)->nullable(false)->change();
        });
    }
};
