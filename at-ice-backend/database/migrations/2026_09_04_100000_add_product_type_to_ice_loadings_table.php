<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ice_loadings', function (Blueprint $table) {
            $table->enum('product_type', ['bags', 'small_sack', 'big_sack'])
                ->nullable()
                ->after('delivery_id');
        });
    }

    public function down(): void
    {
        Schema::table('ice_loadings', function (Blueprint $table) {
            $table->dropColumn('product_type');
        });
    }
};
