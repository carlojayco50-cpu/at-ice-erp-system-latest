<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Review change request, phase 5 (docs/REVIEW-DECISIONS.md): one application
// per email (lower case, trimmed, unique), and the employee who referred an
// applicant through their referral QR link (/job-applications/{employee ID}).
// Referral bonuses are not automatic: Admin adds one by hand as a payroll
// earning.
return new class extends Migration
{
    public function up(): void
    {
        // Normalize saved emails; a later application with an email already
        // used keeps its record but loses the email (noted on the record).
        $seen = [];
        foreach (DB::table('applicants')->whereNotNull('email')->orderBy('id')->get(['id', 'email', 'notes']) as $a) {
            $email = mb_strtolower(trim($a->email));
            if ($email === '') {
                DB::table('applicants')->where('id', $a->id)->update(['email' => null]);
            } elseif (isset($seen[$email])) {
                DB::table('applicants')->where('id', $a->id)->update([
                    'email' => null,
                    'notes' => trim(($a->notes ? $a->notes."\n" : '')."Email {$email} removed: it was already used by applicant #{$seen[$email]}."),
                ]);
            } else {
                $seen[$email] = $a->id;
                DB::table('applicants')->where('id', $a->id)->update(['email' => $email]);
            }
        }

        Schema::table('applicants', function (Blueprint $table) {
            $table->unique('email', 'uq_applicant_email');
            $table->foreignId('referred_by_employee_id')->nullable()->after('source')->constrained('employees')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('referred_by_employee_id');
            $table->dropUnique('uq_applicant_email');
        });
    }
};
