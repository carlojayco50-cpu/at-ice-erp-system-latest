<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Semi-automated performance appraisal (owner, 2026-10-20): every employee
// gets a Draft Base Rating worked out from the records each pay period
// (App\Support\PerformanceScore, nothing stored). A row here only holds what
// Admin changed: the final rating, the goal, the remarks and whether the
// appraisal is published. Only Admin writes it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('final_rating', 3, 1)->nullable(); // 1.0 to 5.0, overrides the base rating
            $table->unsignedInteger('goal_target')->nullable(); // overrides the role's default goal
            $table->text('remarks')->nullable();
            $table->string('status', 12)->default('draft'); // draft | published
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'period_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_reviews');
    }
};
