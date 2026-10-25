<?php

namespace App\Http\Controllers;

use App\Models\Delivery;
use App\Models\DeliveryArrival;
use App\Models\DeliveryCrew;
use App\Support\Audit;
use App\Support\DeliveryRoute;
use App\Support\DriverAvailability;
use App\Support\Settings;
use Illuminate\Http\Request;

// The shared route of a Driver and the Salesmen riding with them, the
// Salesman's choice of Driver, and the Arrived check at the store
// (owner, 2026-10-20; App\Support\DeliveryRoute).
class DeliveryRouteController extends Controller
{
    // GET /api/my-route (Salesman): the Driver they ride with today, the other
    // Drivers on shift they may switch to, and that Driver's route.
    public function salesmanRoute(Request $request)
    {
        $crew = DeliveryRoute::crewFor($request->user());
        $drivers = DeliveryRoute::driversOnShift();
        $onShift = $crew && $drivers->contains('id', $crew->driver_id);

        return response()->json([
            'crew' => $crew ? [
                'driver_id' => $crew->driver_id,
                'driver' => $drivers->firstWhere('id', $crew->driver_id) ?? ['id' => $crew->driver_id, 'name' => $crew->driver?->name],
                'chosen_by' => $crew->chosen_by,
                'on_shift' => $onShift,
            ] : null,
            'drivers' => $drivers,
            'route' => $onShift ? $this->present(DeliveryRoute::todayFor($crew->driver_id)) : [],
            'radius_m' => (int) Settings::get('delivery.arrival_radius_m'),
        ]);
    }

    // PUT /api/my-route/driver (Salesman): ride with another Driver who has
    // timed in today.
    public function chooseDriver(Request $request)
    {
        $data = $request->validate(['driver_id' => 'required|integer']);
        $driver = DeliveryRoute::driversOnShift()->firstWhere('id', (int) $data['driver_id']);
        if (! $driver) {
            return response()->json(['message' => 'Pick a Driver who has timed in today.'], 422);
        }

        $today = DriverAvailability::today();
        $crew = DeliveryCrew::whereDate('date', $today)->where('salesman_id', $request->user()->id)->first();
        if ($crew) {
            $crew->update(['driver_id' => $driver['id'], 'chosen_by' => 'salesman']);
        } else {
            $crew = DeliveryCrew::create(['date' => $today, 'salesman_id' => $request->user()->id, 'driver_id' => $driver['id'], 'chosen_by' => 'salesman']);
        }
        Audit::log('delivery_crew.chosen', $crew, null, ['driver_id' => $driver['id']]);

        return response()->json(['message' => "You now ride with {$driver['name']}."]);
    }

    // POST /api/driver/deliveries/{id}/arrive (Driver) and
    // POST /api/my-route/deliveries/{id}/arrive (Salesman): I am at the store.
    // The phone's GPS must be within delivery.arrival_radius_m of the store pin.
    public function arrive(Request $request, $id)
    {
        $data = $request->validate([
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'accuracy' => 'nullable|numeric|min:0',
        ], [
            'latitude.required' => 'Turn on the location of your phone to press Arrived.',
            'longitude.required' => 'Turn on the location of your phone to press Arrived.',
        ]);

        $user = $request->user();
        $delivery = Delivery::with('customer')->findOrFail($id);
        $role = $user->role === 'driver' ? 'driver' : 'salesman';

        if ($role === 'driver' && (int) $delivery->driver_id !== (int) $user->id) {
            return response()->json(['message' => 'This stop is not on your route.'], 403);
        }
        if ($role === 'salesman') {
            $crew = DeliveryRoute::crewFor($user);
            if (! $crew || (int) $crew->driver_id !== (int) $delivery->driver_id) {
                return response()->json(['message' => 'This stop is on another Driver\'s route. Change your Driver first.'], 403);
            }
        }
        if ($delivery->status !== 'in_transit') {
            return response()->json(['message' => $delivery->status === 'pending'
                ? 'The Driver has not started this delivery yet.'
                : "This delivery is {$delivery->status}."], 422);
        }

        $store = $delivery->customer;
        if (! $store || $store->latitude === null || $store->longitude === null) {
            return response()->json(['message' => 'This store has no map pin yet. Ask Admin to set it on the customer.'], 422);
        }

        $radius = (int) Settings::get('delivery.arrival_radius_m');
        $accuracy = isset($data['accuracy']) ? (int) round($data['accuracy']) : null;
        $meters = (int) round(DeliveryRoute::distanceKm((float) $data['latitude'], (float) $data['longitude'], (float) $store->latitude, (float) $store->longitude) * 1000);
        // a reading is only as good as its accuracy: allow up to 50 m of it
        if ($meters - min($accuracy ?? 0, 50) > $radius) {
            return response()->json([
                'message' => "You are about {$meters} m from {$store->name}. Press Arrived within {$radius} m of the store.",
                'distance_m' => $meters,
            ], 422);
        }

        DeliveryArrival::updateOrCreate(
            ['delivery_id' => $delivery->id, 'user_id' => $user->id],
            ['role' => $role, 'latitude' => $data['latitude'], 'longitude' => $data['longitude'], 'accuracy_m' => $accuracy, 'distance_m' => $meters, 'arrived_at' => now()],
        );

        return response()->json(['message' => "Arrived at {$store->name}.", 'delivery' => $this->present(collect([$delivery->fresh(['customer', 'arrivals'])]))[0]]);
    }

    // Who has arrived: the Driver, and the Salesman asking (or any Salesman,
    // for the Driver's screen).
    private function present($deliveries): array
    {
        $me = request()->user();

        return collect($deliveries)->map(function ($d) use ($me) {
            $arr = $d->arrivals ?? collect();
            $d->setAttribute('arrival', [
                'driver' => (bool) $arr->firstWhere('role', 'driver'),
                'salesman' => $me->role === 'driver'
                    ? (bool) $arr->firstWhere('role', 'salesman')
                    : (bool) $arr->firstWhere('user_id', $me->id),
                'salesman_names' => $arr->where('role', 'salesman')->pluck('user_id')->values(),
            ]);

            return $d;
        })->values()->all();
    }

    // GET /api/driver/deliveries (Driver): today's route nearest the plant
    // first, then upcoming stops (7 days) and the last 30 days delivered.
    public function driverDeliveries(Request $request)
    {
        $driverId = $request->user()->id;
        $route = DeliveryRoute::todayFor($driverId);
        $today = DriverAvailability::today();

        $later = Delivery::with(['customer', 'items.product', 'proofs', 'arrivals', 'reassignedFrom:id,name'])
            ->where('driver_id', $driverId)
            ->whereNotIn('id', $route->pluck('id'))
            ->where(fn ($q) => $q
                ->where(fn ($p) => $p->whereIn('status', ['pending', 'in_transit'])->whereDate('scheduled_date', '<=', now()->parse($today)->addDays(7)->toDateString()))
                ->orWhere(fn ($d) => $d->where('status', 'delivered')->whereDate('scheduled_date', '>=', now()->parse($today)->subDays(30)->toDateString())))
            ->orderBy('scheduled_date')->orderBy('ordered_at')
            ->get();

        $route->each(fn ($d) => $d->setAttribute('route_today', true));

        return response()->json([
            'salesmen' => DeliveryRoute::salesmenOf($driverId),
            'radius_m' => (int) Settings::get('delivery.arrival_radius_m'),
            'deliveries' => $this->present($route->concat(DeliveryRoute::sortByDistance($later))),
        ]);
    }
}
