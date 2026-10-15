<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3 archive expiry: an anonymized employee keeps the row (employee ID, dates,
// pay history) with the personal details removed, and leaves the review list.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->timestamp('anonymized_at')->nullable()->after('deactivated_by');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('anonymized_at');
        });
    }
};
