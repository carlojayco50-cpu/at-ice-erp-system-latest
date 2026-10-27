<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The employee performance reviews feature was removed. down() puts the
// table back with its original columns (the reviews themselves are not).
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('employee_performance');
    }

    public function down(): void
    {
        Schema::create('employee_performance', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->onDelete('cascade');
            $table->date('review_period_start');
            $table->date('review_period_end');
            $table->unsignedTinyInteger('rating'); // 1 to 5
            $table->text('notes')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
        });
    }
};
