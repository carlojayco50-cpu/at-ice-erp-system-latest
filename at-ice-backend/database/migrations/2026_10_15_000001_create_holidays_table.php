<?php

use Database\Seeders\HolidaySeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3 (docs/REVIEW-DECISIONS.md): the holiday calendar. Business logic always
// reads holidays from this table (they change yearly and can be declared on
// short notice). Admin and HR keep it up to date (HolidayController). The
// 2026 Philippine holidays are seeded here so every install has them.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->string('name');
            // REGULAR | SPECIAL_NON_WORKING | SPECIAL_WORKING
            $table->string('type', 20);
            // Two holidays on one date (e.g. a regular holiday that is also another
            // holiday); paid with the DOUBLE_HOLIDAY multiplier.
            $table->boolean('is_double')->default(false);
            $table->unsignedSmallInteger('year');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('year');
        });

        (new HolidaySeeder)->run();
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
    }
};
