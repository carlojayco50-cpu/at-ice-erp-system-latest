<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// A delivery's ice loading is counted once (owner, 2026-10-16: there are two
// Checkers). One row per product type per delivery; a second count of the same
// delivery is refused by IceLoadingController, and this index is the backstop.
return new class extends Migration
{
    public function up(): void
    {
        // Older double submissions: keep the first count of each product type.
        $keep = DB::table('ice_loadings')
            ->whereNotNull('product_type')
            ->selectRaw('MIN(id) as id')
            ->groupBy('delivery_id', 'product_type')
            ->pluck('id');

        DB::table('ice_loadings')
            ->whereNotNull('product_type')
            ->whereNotIn('id', $keep)
            ->delete();

        Schema::table('ice_loadings', function (Blueprint $table) {
            $table->unique(['delivery_id', 'product_type'], 'ice_loadings_delivery_product_unique');
        });
    }

    public function down(): void
    {
        Schema::table('ice_loadings', function (Blueprint $table) {
            $table->dropUnique('ice_loadings_delivery_product_unique');
        });
    }
};
