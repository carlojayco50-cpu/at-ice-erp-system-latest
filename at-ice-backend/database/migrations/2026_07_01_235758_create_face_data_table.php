<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('face_data', function (Blueprint $table) {
            $table->id();
            $table->string('worker_name');
            $table->enum('role', ['driver', 'salesman', 'checker', 'maintenance', 'guard', 'bagger']);
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->json('descriptor'); // 128-float array from face-api.js
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('face_data');
    }
};
