<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3: net pay is never negative. When the deductions are more than the gross,
// the shortfall is either carried to the next cut-off (carry_over_out, taken
// there as carry_over_in) or paid by the employer (employer_shouldered), by
// the payroll.negative_net_handling setting.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('carry_over_in', 12, 2)->default(0)->after('net_pay');
            $table->decimal('carry_over_out', 12, 2)->default(0)->after('carry_over_in');
            $table->decimal('employer_shouldered', 12, 2)->default(0)->after('carry_over_out');
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn(['carry_over_in', 'carry_over_out', 'employer_shouldered']);
        });
    }
};
