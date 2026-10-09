<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('applicants', function (Blueprint $table) {
            $table->id();

            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('position_applied');

            // Interview scheduling
            $table->dateTime('interview_date')->nullable();

            // Status flow: pending → interviewed → hired / rejected
            $table->enum('status', [
                'pending',
                'interviewed',
                'hired',
                'rejected',
            ])->default('pending');

            $table->text('notes')->nullable(); // HR notes about applicant

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('applicants');
    }
};
