<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Delivery crews and arrivals (owner, 2026-10-20):
//   delivery_crews     which Driver (truck) a Salesman rides with on a day:
//                      picked by the system, or changed by the Salesman to
//                      another Driver who has timed in (App\Support\DeliveryRoute)
//   delivery_arrivals  the Driver and the Salesman each press Arrived at the
//                      store; the phone's GPS must be within
//                      delivery.arrival_radius_m of the store pin. A delivery is
//                      confirmed only after both have arrived.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_crews', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->foreignId('salesman_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('chosen_by', 10)->default('system'); // system | salesman
            $table->timestamps();
            $table->unique(['date', 'salesman_id']);
            $table->index(['date', 'driver_id']);
        });

        Schema::create('delivery_arrivals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role', 10); // driver | salesman
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->unsignedInteger('accuracy_m')->nullable();
            $table->unsignedInteger('distance_m');
            $table->timestamp('arrived_at');
            $table->timestamps();
            $table->unique(['delivery_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_arrivals');
        Schema::dropIfExists('delivery_crews');
    }
};
