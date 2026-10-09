<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Middle initial (e.g. "D") and name suffix (Jr., Sr., II, III, IV, V) for
// employees. Both optional; older rows stay as they are.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('middle_initial', 2)->nullable()->after('first_name');
            $table->string('suffix', 10)->nullable()->after('last_name');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['middle_initial', 'suffix']);
        });
    }
};
