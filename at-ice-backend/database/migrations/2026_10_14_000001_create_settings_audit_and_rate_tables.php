<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Review change request, phase 1 (docs/REVIEW-DECISIONS.md):
//   settings           rates and rules Admin can change (App\Support\Settings
//                      holds the defaults; a row here overrides one)
//   audit_logs         who did a sensitive action, with before/after values
//   contribution_rates SSS, PhilHealth, Pag-IBIG and withholding tax rules,
//                      each with the date it takes effect
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->text('value'); // JSON
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 100);
            $table->string('subject_type', 100)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['subject_type', 'subject_id']);
            $table->index('action');
        });

        Schema::create('contribution_rates', function (Blueprint $table) {
            $table->id();
            $table->string('type', 20); // sss | philhealth | pagibig | tax
            $table->date('effective_from');
            $table->json('rules');
            $table->string('note')->nullable();
            $table->timestamps();
            $table->unique(['type', 'effective_from']);
        });

        // Current Philippine values. VERIFY BEFORE PRODUCTION: SSS, PhilHealth,
        // Pag-IBIG and BIR change these; add a row with a new effective_from
        // instead of editing an old one, so older payrolls keep their rules.
        $note = 'Seeded 2026-10-14. Verify before production.';
        $now = now();
        DB::table('contribution_rates')->insert([
            [
                'type' => 'sss', 'effective_from' => '2025-01-01', 'note' => $note, 'created_at' => $now, 'updated_at' => $now,
                // Employee share 5% of the Monthly Salary Credit: monthly pay
                // rounded to the nearest 500, between the floor and the ceiling.
                'rules' => json_encode(['employee_rate' => 0.05, 'msc_min' => 5000, 'msc_max' => 35000, 'msc_step' => 500]),
            ],
            [
                'type' => 'philhealth', 'effective_from' => '2025-01-01', 'note' => $note, 'created_at' => $now, 'updated_at' => $now,
                // 5% premium split evenly: employee 2.5% of monthly basic
                // salary, with a 10,000 floor and 100,000 ceiling on the basis.
                'rules' => json_encode(['employee_rate' => 0.025, 'basis_min' => 10000, 'basis_max' => 100000]),
            ],
            [
                'type' => 'pagibig', 'effective_from' => '2024-02-01', 'note' => $note, 'created_at' => $now, 'updated_at' => $now,
                // Employee 2% of monthly compensation, at most 200 a month.
                'rules' => json_encode(['employee_rate' => 0.02, 'max' => 200]),
            ],
            [
                'type' => 'tax', 'effective_from' => '2023-01-01', 'note' => $note, 'created_at' => $now, 'updated_at' => $now,
                // TRAIN law annual table: tax = base + rate x (income over "over").
                // Income up to 250,000 a year is exempt.
                'rules' => json_encode(['annual_brackets' => [
                    ['over' => 0, 'base' => 0, 'rate' => 0],
                    ['over' => 250000, 'base' => 0, 'rate' => 0.15],
                    ['over' => 400000, 'base' => 22500, 'rate' => 0.20],
                    ['over' => 800000, 'base' => 102500, 'rate' => 0.25],
                    ['over' => 2000000, 'base' => 402500, 'rate' => 0.30],
                    ['over' => 8000000, 'base' => 2202500, 'rate' => 0.35],
                ]]),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('contribution_rates');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('settings');
    }
};
