<?php

namespace App\Support;

use App\Models\Delivery;
use App\Models\DeliveryCrew;
use App\Models\User;
use Illuminate\Support\Collection;

// Today's route of a Driver, shared by the Driver and the Salesmen riding with
// them (owner, 2026-10-20):
//   - the stops are listed nearest to the plant first (plant.latitude and
//     plant.longitude in Settings; a store without a pin goes last)
//   - a Salesman rides with one Driver a day (delivery_crews): the system picks
//     one who has timed in, and the Salesman may change it to any other Driver
//     who has timed in
class DeliveryRoute
{
    // Great-circle distance in kilometers.
    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1.0, sqrt($a)));
    }

    public static function plant(): array
    {
        return [(float) Settings::get('plant.latitude'), (float) Settings::get('plant.longitude')];
    }

    // Each delivery gets distance_km (from the plant to its store) and the
    // list is sorted nearest first; stores without a pin go last.
    public static function sortByDistance(Collection $deliveries): Collection
    {
        [$pLat, $pLng] = self::plant();

        return $deliveries->each(function ($d) use ($pLat, $pLng) {
            $c = $d->customer;
            $d->setAttribute('distance_km', $c && $c->latitude !== null && $c->longitude !== null
                ? round(self::distanceKm($pLat, $pLng, (float) $c->latitude, (float) $c->longitude), 2)
                : null);
        })->sortBy(fn ($d) => [$d->distance_km === null ? 1 : 0, $d->distance_km ?? 0, (string) $d->ordered_at])->values();
    }

    // Today's stops of a Driver: open ones due today or earlier, nearest first,
    // then the ones delivered today. Same list for the Driver and the Salesman.
    public static function todayFor(int $driverId): Collection
    {
        $today = DriverAvailability::today();
        $with = ['customer', 'items.product', 'proofs', 'arrivals', 'reassignedFrom:id,name', 'driver:id,name'];

        $open = Delivery::with($with)
            ->where('driver_id', $driverId)
            ->whereIn('status', ['pending', 'in_transit'])
            ->whereDate('scheduled_date', '<=', $today)
            ->get();
        $done = Delivery::with($with)
            ->where('driver_id', $driverId)
            ->where('status', 'delivered')
            ->whereDate('delivered_at', $today)
            ->orderByDesc('delivered_at')
            ->get();

        $route = self::sortByDistance($open)->concat(self::sortByDistance($done)->sortByDesc('delivered_at')->values());

        return $route->values()->each(fn ($d, $i) => $d->setAttribute('stop_no', $i + 1));
    }

    // Drivers on shift now: timed in today and not timed out (they may be on
    // the road), with their truck and number of stops today.
    public static function driversOnShift(): Collection
    {
        $today = DriverAvailability::today();
        $rows = collect(DriverAvailability::all())->whereIn('status', ['available', 'in_transit'])->values();
        if ($rows->isEmpty()) {
            return collect();
        }

        $users = User::with('employee:id,user_id,vehicle_plate')->whereIn('id', $rows->pluck('id'))->get()->keyBy('id');
        $stops = Delivery::whereIn('driver_id', $rows->pluck('id'))
            ->whereIn('status', ['pending', 'in_transit'])
            ->whereDate('scheduled_date', '<=', $today)
            ->selectRaw('driver_id, COUNT(*) as n')->groupBy('driver_id')->pluck('n', 'driver_id');
        $crews = DeliveryCrew::whereDate('date', $today)->selectRaw('driver_id, COUNT(*) as n')->groupBy('driver_id')->pluck('n', 'driver_id');

        return $rows->map(fn ($r) => [
            'id' => $r['id'],
            'name' => $r['name'],
            'employee_id' => $r['employee_id'],
            'vehicle_plate' => $users->get($r['id'])?->employee?->vehicle_plate,
            'status' => $r['status'],
            'reason' => $r['reason'],
            'open_stops' => (int) ($stops[$r['id']] ?? 0),
            'salesmen' => (int) ($crews[$r['id']] ?? 0),
        ])->sortBy('name')->values();
    }

    // The Salesman's crew today. A missing crew, or one whose Driver is no
    // longer on shift, gets a Driver picked by the system: the one on shift
    // with the fewest Salesmen, then the most open stops. Null when no Driver
    // has timed in.
    public static function crewFor(User $salesman): ?DeliveryCrew
    {
        $today = DriverAvailability::today();
        $drivers = self::driversOnShift();
        $crew = DeliveryCrew::whereDate('date', $today)->where('salesman_id', $salesman->id)->first();

        if ($crew && $drivers->contains('id', $crew->driver_id)) {
            return $crew;
        }
        if ($drivers->isEmpty()) {
            return $crew; // keep the last pick; the page says nobody has timed in
        }

        $pick = $drivers->sortBy(fn ($d) => [$d['salesmen'], -$d['open_stops'], $d['name']])->first();
        if ($crew) {
            $crew->update(['driver_id' => $pick['id'], 'chosen_by' => 'system']);

            return $crew;
        }

        return DeliveryCrew::create(['date' => $today, 'salesman_id' => $salesman->id, 'driver_id' => $pick['id'], 'chosen_by' => 'system']);
    }

    // Salesmen riding with a Driver today (names, for the Driver's screen).
    public static function salesmenOf(int $driverId): Collection
    {
        return DeliveryCrew::with('salesman:id,name')
            ->whereDate('date', DriverAvailability::today())
            ->where('driver_id', $driverId)
            ->get()
            ->map(fn ($c) => ['id' => $c->salesman_id, 'name' => $c->salesman?->name]);
    }
}
