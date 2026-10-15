<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3: where a project is, as a text address for now. Latitude, longitude and a
// geofence radius are ready (nullable, unused) in case geofencing is decided
// later; it is not built.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->string('location', 500)->nullable()->after('description');
            $table->decimal('latitude', 10, 7)->nullable()->after('location');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->unsignedInteger('geofence_radius_m')->nullable()->after('longitude');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['location', 'latitude', 'longitude', 'geofence_radius_m']);
        });
    }
};
