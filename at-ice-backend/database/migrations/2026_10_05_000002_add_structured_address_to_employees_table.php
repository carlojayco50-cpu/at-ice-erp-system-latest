<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Same separate address fields as customers, plus city and province.
// The old `address` column stays and is rebuilt from the street-level fields.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('block_lot')->nullable()->after('phone');
            $table->string('street')->nullable()->after('block_lot');
            $table->string('subdivision')->nullable()->after('street');
            $table->string('barangay')->nullable()->after('subdivision');
            $table->string('city')->nullable()->after('address');
            $table->string('province')->nullable()->after('city');
            $table->string('postal_code', 10)->nullable()->after('province');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['block_lot', 'street', 'subdivision', 'barangay', 'city', 'province', 'postal_code']);
        });
    }
};
