<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// One row per unlocked kiosk device. Only a hash of the token is stored.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kiosk_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('token_hash', 64)->unique();
            $table->unsignedInteger('pin_version');
            $table->timestamp('expires_at');
            $table->timestamp('last_used_at')->nullable();
            $table->string('created_ip', 45)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kiosk_tokens');
    }
};
