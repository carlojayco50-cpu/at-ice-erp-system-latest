<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// How long an interview is expected to take (30 or 45 minutes). Interviews
// may not overlap (App\Models\Applicant::overlapping).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->unsignedSmallInteger('interview_minutes')->default(30)->after('interview_date');
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->dropColumn('interview_minutes');
        });
    }
};
