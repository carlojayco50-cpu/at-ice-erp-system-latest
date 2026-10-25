<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Full biodata for employees and applicants (owner, 2026-10-20): personal
// details, emergency contact, education and work history, the Driver's
// license restriction codes, government numbers (employees only, never asked
// on the public form) and attached documents on the private disk. The
// applicant's data and documents carry over to the employee when hired.
// employees.employee_id (EMP-0001) stays the unique business key; the numeric
// id stays the primary key every other table points to.
return new class extends Migration
{
    private const BIO = [
        'birth_date' => 'date', 'sex' => 'string:10', 'civil_status' => 'string:12', 'nationality' => 'string:50',
        'place_of_birth' => 'string:120', 'personal_email' => 'string:255',
        'emergency_name' => 'string:120', 'emergency_relationship' => 'string:40', 'emergency_phone' => 'string:20',
        'education_level' => 'string:30', 'school' => 'string:160', 'course' => 'string:160', 'year_graduated' => 'smallint',
        'work_history' => 'json', 'license_restrictions' => 'string:40',
    ];

    private function addBio(Blueprint $table): void
    {
        foreach (self::BIO as $col => $type) {
            [$kind, $len] = array_pad(explode(':', $type), 2, null);
            $c = match ($kind) {
                'date' => $table->date($col),
                'json' => $table->json($col),
                'smallint' => $table->unsignedSmallInteger($col),
                default => $table->string($col, (int) $len),
            };
            $c->nullable();
        }
    }

    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $this->addBio($table);
            foreach (['sss_no', 'tin_no', 'philhealth_no', 'pagibig_no'] as $col) {
                $table->string($col, 20)->nullable()->unique();
            }
        });

        Schema::table('applicants', function (Blueprint $table) {
            $this->addBio($table);
            $table->string('license_number', 20)->nullable();
            $table->date('license_expiry')->nullable();
            $table->timestamp('consented_at')->nullable(); // Data Privacy Act consent on /apply
            $table->string('consent_ip', 45)->nullable();
        });

        foreach (['employee_documents' => 'employees', 'applicant_documents' => 'applicants'] as $name => $owner) {
            Schema::create($name, function (Blueprint $table) use ($owner) {
                $table->id();
                $table->foreignId(rtrim($owner, 's').'_id')->constrained($owner)->cascadeOnDelete();
                $table->string('type', 20); // resume | photo | nbi | government_id | diploma | other
                $table->string('path');
                $table->string('original_name');
                $table->string('mime', 100);
                $table->unsignedInteger('size');
                $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('applicant_documents');
        Schema::dropIfExists('employee_documents');
        Schema::table('applicants', function (Blueprint $table) {
            $table->dropColumn(array_merge(array_keys(self::BIO), ['license_number', 'license_expiry', 'consented_at', 'consent_ip']));
        });
        Schema::table('employees', function (Blueprint $table) {
            foreach (['sss_no', 'tin_no', 'philhealth_no', 'pagibig_no'] as $col) {
                $table->dropUnique([$col]);
            }
            $table->dropColumn(array_merge(array_keys(self::BIO), ['sss_no', 'tin_no', 'philhealth_no', 'pagibig_no']));
        });
    }
};
