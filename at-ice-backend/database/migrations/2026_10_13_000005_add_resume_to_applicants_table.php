<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The resume or CV an applicant attaches on the public form (/apply). Stored on
// the private disk (storage/app/private/resumes), never public; HR opens it
// through GET applicants/{id}/resume.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->string('resume_path')->nullable()->after('notes');
            $table->string('resume_name')->nullable()->after('resume_path');
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->dropColumn(['resume_path', 'resume_name']);
        });
    }
};
