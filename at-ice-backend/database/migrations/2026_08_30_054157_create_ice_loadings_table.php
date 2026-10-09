<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ice_loadings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->foreignId('checker_id')->constrained('users')->cascadeOnDelete();
            $table->integer('quantity_loaded');
            $table->dateTime('loaded_at');
            $table->timestamps();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('ice_loadings');
    }
};
