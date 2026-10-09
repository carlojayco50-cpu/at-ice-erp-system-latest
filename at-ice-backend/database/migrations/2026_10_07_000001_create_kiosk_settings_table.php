<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// One row holding the HR security PIN of the Attendance Station kiosk.
// The PIN is stored only as a hash. pin_version goes up on every change, which
// locks every kiosk that was unlocked with the old PIN.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kiosk_settings', function (Blueprint $table) {
            $table->id();
            $table->string('pin_hash')->nullable();
            $table->unsignedInteger('pin_version')->default(1);
            $table->timestamp('pin_changed_at')->nullable();
            $table->foreignId('pin_changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kiosk_settings');
    }
};
