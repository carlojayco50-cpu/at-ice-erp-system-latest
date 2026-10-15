<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Applicants get the same address fields as employees, so a hired applicant's
// address carries over to Add Employee. All optional.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->string('block_lot')->nullable()->after('phone');
            $table->string('street')->nullable()->after('block_lot');
            $table->string('subdivision')->nullable()->after('street');
            $table->string('barangay')->nullable()->after('subdivision');
            $table->string('city')->nullable()->after('barangay');
            $table->string('province')->nullable()->after('city');
            $table->string('region')->nullable()->after('province');
            $table->string('barangay_code', 10)->nullable()->after('region');
            $table->string('postal_code', 10)->nullable()->after('barangay_code');
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->dropColumn(['block_lot', 'street', 'subdivision', 'barangay', 'city', 'province', 'region', 'barangay_code', 'postal_code']);
        });
    }
};
