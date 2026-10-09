<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            // decimal so a half day can be stored as 0.5
            $table->decimal('total_days', 4, 1)->change();
            $table->boolean('is_half_day')->default(false)->after('total_days');
            $table->string('attachment_path')->nullable()->after('admin_notes');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn(['is_half_day', 'attachment_path']);
            $table->integer('total_days')->change();
        });
    }
};
