<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Adds the separate address fields. The old `address` column stays: it is
// rebuilt from these fields on every save, and old records keep their text.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('block_lot')->nullable()->after('branch_code');
            $table->string('street')->nullable()->after('block_lot');
            $table->string('subdivision')->nullable()->after('street');
            $table->string('barangay')->nullable()->after('subdivision');
            $table->string('postal_code', 10)->nullable()->after('province');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['block_lot', 'street', 'subdivision', 'barangay', 'postal_code']);
        });
    }
};
