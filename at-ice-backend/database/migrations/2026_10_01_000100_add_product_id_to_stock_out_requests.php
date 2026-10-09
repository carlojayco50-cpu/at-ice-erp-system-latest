<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Links each Maintenance stock-out request to a real inventory item, and to
// the stock movement created when the Checker releases it. Both are nullable
// so requests made before this change (free-text item names) still load.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_out_requests', function (Blueprint $table) {
            if (! Schema::hasColumn('stock_out_requests', 'product_id')) {
                $table->foreignId('product_id')->nullable()->after('requested_by')
                    ->constrained('products')->nullOnDelete();
            }
            if (! Schema::hasColumn('stock_out_requests', 'stock_movement_id')) {
                $table->foreignId('stock_movement_id')->nullable()->after('released_at')
                    ->constrained('stock_movements')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stock_out_requests', function (Blueprint $table) {
            if (Schema::hasColumn('stock_out_requests', 'stock_movement_id')) {
                $table->dropConstrainedForeignId('stock_movement_id');
            }
            if (Schema::hasColumn('stock_out_requests', 'product_id')) {
                $table->dropConstrainedForeignId('product_id');
            }
        });
    }
};
