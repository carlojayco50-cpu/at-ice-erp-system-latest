<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Addresses are now picked from the official PSGC lists (Region > Province >
// City/Municipality > Barangay). Adds the region name and the barangay's PSGC
// code next to the existing name columns; suppliers also get a barangay.
return new class extends Migration
{
    public function up(): void
    {
        foreach (['employees', 'customers'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('region')->nullable()->after('barangay');
                $t->string('barangay_code', 10)->nullable()->after('region');
            });
        }

        Schema::table('suppliers', function (Blueprint $t) {
            $t->string('barangay')->nullable()->after('address');
            $t->string('barangay_code', 10)->nullable()->after('barangay');
            $t->string('region')->nullable()->after('province');
        });
    }

    public function down(): void
    {
        foreach (['employees', 'customers'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['region', 'barangay_code']);
            });
        }

        Schema::table('suppliers', function (Blueprint $t) {
            $t->dropColumn(['barangay', 'barangay_code', 'region']);
        });
    }
};
