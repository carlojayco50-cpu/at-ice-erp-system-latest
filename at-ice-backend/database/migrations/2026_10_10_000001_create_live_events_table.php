<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Live feed: one row per thing that happened in a flow (leave filed, delivery
// in transit, stock-out approved...). Every open page polls GET live-feed and
// shows the new rows meant for its user as pop-up notices (App\Support\LiveFeed).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_events', function (Blueprint $table) {
            $table->id();
            $table->string('module', 40);
            $table->string('action', 20);
            $table->string('message', 255);
            $table->json('roles')->nullable();    // e.g. ["hr", "employee:checker"]; admin always sees
            $table->json('user_ids')->nullable(); // specific users who should see it
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_events');
    }
};
