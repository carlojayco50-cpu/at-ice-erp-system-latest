<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            // Drop the existing FK constraint first (required before altering the column)
            $table->dropForeign(['recorded_by']);
        });

        Schema::table('attendances', function (Blueprint $table) {
            // Make the column nullable
            $table->foreignId('recorded_by')->nullable()->change();
        });

        Schema::table('attendances', function (Blueprint $table) {
            // Re-add the FK, now allowing null (kiosk detections won't have a recorder)
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropForeign(['recorded_by']);
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->foreignId('recorded_by')->nullable(false)->change();
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('cascade');
        });
    }
};
