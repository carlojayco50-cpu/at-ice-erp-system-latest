<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->foreignId('face_data_id')->nullable()->after('id')->constrained('face_data')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropForeign(['face_data_id']);
            $table->dropColumn('face_data_id');
        });
    }
};
