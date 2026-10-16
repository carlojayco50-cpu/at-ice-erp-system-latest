<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// total_days was decimal(4,1), so MySQL stored 6 hours of emergency leave
// (0.75 day) as 0.8. It now has two decimals like hours, paid_days and
// unpaid_days. Existing values are unchanged.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->decimal('total_days', 5, 2)->change();
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->decimal('total_days', 4, 1)->change();
        });
    }
};
