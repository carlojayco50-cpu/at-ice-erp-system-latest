<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The picture taken when a face is enrolled, shown to HR from the Face action
// in HRIS > Employees. Stored on the public disk (face-photos/...).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('face_data', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('descriptor');
        });
    }

    public function down(): void
    {
        Schema::table('face_data', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};
