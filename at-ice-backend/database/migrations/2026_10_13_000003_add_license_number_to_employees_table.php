<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A driver's license number (LTO format N01-23-456789), required for Drivers.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('license_number', 20)->nullable()->unique()->after('vehicle_plate');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropUnique(['license_number']);
            $table->dropColumn('license_number');
        });
    }
};
