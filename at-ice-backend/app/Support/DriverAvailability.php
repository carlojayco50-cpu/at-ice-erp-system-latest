<?php

namespace App\Support;

use App\Models\Delivery;
use App\Models\User;
use Carbon\Carbon;

// Which Drivers can be given a delivery, worked out from the records (nobody
// types it in):
//   available    timed in today at the Attendance Station, not timed out,
//                and not on a delivery that is in transit
//   in_transit   has a delivery in transit (shown, not selectable)
//   unavailable  not timed in yet today, timed out, or no active employee
//                record (shown, not selectable)
// The rule applies to deliveries for today. A delivery for a later day can
// go to any active Driver, since nobody has timed in for that day yet.
class DriverAvailability
{
    public const LOCAL_TZ = 'Asia/Manila';

    public static function today(): string
    {
        return Carbon::now(self::LOCAL_TZ)->toDateString();
    }

    // Is the rule checked for a delivery on this date?
    public static function enforcedFor(?string $date): bool
    {
        return ! $date || Carbon::parse($date)->toDateString() <= self::today();
    }

    public static function all(): array
    {
        $today = self::today();

        $drivers = User::where('role', 'driver')
            ->with(['employee' => fn ($q) => $q->with(['attendances' => fn ($a) => $a->whereDate('date', $today)])])
            ->orderBy('name')
            ->get(['id', 'name', 'role']);

        $inTransit = Delivery::where('status', 'in_transit')
            ->whereIn('driver_id', $drivers->pluck('id'))
            ->get(['id', 'driver_id', 'delivery_no'])
            ->groupBy('driver_id');

        return $drivers->map(function ($u) use ($inTransit) {
            $emp = $u->employee;
            $att = $emp?->attendances->first();
            $trip = $inTransit->get($u->id)?->first();

            if (! $emp || ! $emp->is_active) {
                [$status, $reason] = ['unavailable', 'No active employee record'];
            } elseif ($trip) {
                [$status, $reason] = ['in_transit', "On delivery {$trip->delivery_no}"];
            } elseif (! $att || ! $att->time_in) {
                [$status, $reason] = ['unavailable', 'Not timed in yet'];
            } elseif ($att->time_out) {
                [$status, $reason] = ['unavailable', 'Timed out'];
            } else {
                [$status, $reason] = ['available', 'Timed in '.substr((string) $att->time_in, 0, 5)];
            }

            return [
                'id' => $u->id,
                'name' => $emp?->full_name ?: $u->name,
                'employee_id' => $emp?->employee_id,
                'status' => $status,
                'reason' => $reason,
            ];
        })->values()->all();
    }

    // Null when this Driver may take a delivery on $date, otherwise why not.
    public static function refusal(int $driverId, ?string $date): ?string
    {
        $user = User::find($driverId);
        if (! $user || $user->role !== 'driver') {
            return 'Please select a driver.';
        }
        if (! self::enforcedFor($date)) {
            return null;
        }

        $row = collect(self::all())->firstWhere('id', $driverId);

        return match ($row['status'] ?? 'unavailable') {
            'available' => null,
            'in_transit' => "{$row['name']} is in transit ({$row['reason']}). Pick an available driver.",
            default => "{$row['name']} is unavailable (".strtolower($row['reason'] ?? 'not timed in yet').'). Pick a driver who has timed in today.',
        };
    }
}
