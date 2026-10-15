<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Admin's project board (monday.com style): maintenance and plant jobs that
// use inventory supplies. Each Maintenance stock-out request can belong to a
// project, so the board shows what each project used and cost.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('status', 20)->default('planned'); // planned, working, stuck, done
            $table->string('priority', 20)->default('medium'); // low, medium, high, critical
            $table->string('owner')->nullable();
            $table->date('start_date')->nullable();
            $table->date('due_date')->nullable();
            $table->decimal('budget', 12, 2)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('stock_out_requests', function (Blueprint $table) {
            $table->foreignId('project_id')->nullable()->after('product_id')->constrained('projects')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('stock_out_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('project_id');
        });
        Schema::dropIfExists('projects');
    }
};
