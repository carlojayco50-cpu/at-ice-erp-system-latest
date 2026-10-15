<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Records past the retention period (retention.years) are never deleted on
// their own: Admin reviews them and chooses per record to download a CSV and
// delete, keep, or delete. "Keep" is stored here and hides the record from the
// review until kept_until.
//   kind "employee"        ref = employees.id (an inactive employee)
//   kind "attendance_year" ref = the year of old attendance records
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('retention_holds', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 20);
            $table->string('ref', 20);
            $table->date('kept_until');
            $table->foreignId('kept_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['kind', 'ref']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('retention_holds');
    }
};
