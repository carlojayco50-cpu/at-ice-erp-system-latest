<?php

namespace App\Support;

use App\Mail\DeliveryDelayNotice;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryContract;
use App\Models\DeliveryNotification;
use App\Models\DriverLeave;
use App\Models\DriverStoreAssignment;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LiveEvent;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

// Contract deliveries (owner decision 2026-10-17):
//   generate()        an approved contract makes one delivery per store per
//                     delivery day; the Driver comes from driver_store_assignments
//   reassign()        a Driver who is off today (not timed in by
//                     delivery.not_timed_in_minutes after their shift start, an
//                     approved leave request, or an older driver_leaves mark;
//                     Admin no longer marks anyone absent, owner 2026-10-20)
//                     has their pending deliveries given at random
//                     to an available Driver; when none is free they are queued
//   assignQueued()    queued deliveries go LIFO (latest ordered_at first) to the
//                     Driver who became available first
//   sendDelayNotices  a reassigned or queued delivery tells its store it may be
//                     late, delivery.delay_notice_hours before it is due
// Available = timed in today, not timed out, not in transit
// (App\Support\DriverAvailability) and not off. There is no scheduler: run() is
// called by the live-feed poll (every few seconds while anyone is signed in).
class DeliveryDispatch
{
    // Users (Drivers) who are off on $date => why.
    public static function offDrivers(string $date): array
    {
        $off = [];
        foreach (DriverLeave::whereDate('date', $date)->get(['driver_id', 'type']) as $l) {
            $off[$l->driver_id] = DriverLeave::TYPES[$l->type] ?? $l->type;
        }

        if ($date === DriverAvailability::today()) {
            $off += self::notTimedIn();
        }

        $employeeIds = LeaveRequest::where('status', 'approved')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->pluck('employee_id');
        if ($employeeIds->isNotEmpty()) {
            foreach (Employee::whereIn('id', $employeeIds)->whereNotNull('user_id')->pluck('user_id') as $userId) {
                $off[$userId] ??= 'On leave';
            }
        }

        return $off;
    }

    // Drivers (user id => why) who have not timed in today although their
    // shift started more than delivery.not_timed_in_minutes ago: absence is
    // detected from attendance, nobody marks it.
    public static function notTimedIn(): array
    {
        static $memo = [null, []];
        $now = Carbon::now(DriverAvailability::LOCAL_TZ);
        if ($memo[0] === $now->format('Y-m-d H:i')) {
            return $memo[1];
        }
        $minutes = (int) Settings::get('delivery.not_timed_in_minutes');
        $out = [];
        foreach (DriverAvailability::all() as $row) {
            if ($row['status'] !== 'unavailable' || $row['reason'] !== 'Not timed in yet') {
                continue;
            }
            $employee = Employee::where('user_id', $row['id'])->first();
            if (! $employee || ($employee->date_hired && $employee->date_hired->toDateString() > $now->toDateString())) {
                continue;
            }
            $start = Lateness::shiftStart($employee);
            if ($start && $now->greaterThanOrEqualTo(Carbon::parse($now->toDateString().' '.$start, DriverAvailability::LOCAL_TZ)->addMinutes($minutes))) {
                $out[$row['id']] = 'Not timed in';
            }
        }
        $memo = [$now->format('Y-m-d H:i'), $out];

        return $out;
    }

    // Driver ids who can take a delivery today, the one who became free first
    // first (last delivery finished today, or time in).
    public static function availableDrivers(array $exclude = []): array
    {
        $today = DriverAvailability::today();
        $off = self::offDrivers($today);
        $ids = collect(DriverAvailability::all())
            ->where('status', 'available')
            ->pluck('id')
            ->reject(fn ($id) => isset($off[$id]) || in_array($id, $exclude, false))
            ->values();
        if ($ids->isEmpty()) {
            return [];
        }

        $freeSince = Delivery::whereIn('driver_id', $ids)
            ->where('status', 'delivered')
            ->whereDate('delivered_at', $today)
            ->groupBy('driver_id')
            ->pluck(DB::raw('MAX(delivered_at)'), 'driver_id');

        return $ids->sortBy(fn ($id) => (string) ($freeSince[$id] ?? ''))->values()->all();
    }

    // The pending deliveries today of a Driver who is off, latest first, go to a
    // random available Driver, or to the queue when nobody is free. Only today:
    // a leave on a later day is handled on that day, when attendance is known.
    public static function reassign(int $driverId, string $date): int
    {
        if ($date !== DriverAvailability::today()) {
            return 0;
        }

        return DB::transaction(function () use ($driverId, $date) {
            $pending = Delivery::where('driver_id', $driverId)
                ->whereDate('scheduled_date', $date)
                ->where('status', 'pending')
                ->orderByDesc('ordered_at')->orderByDesc('id')
                ->lockForUpdate()
                ->get();

            foreach ($pending as $d) {
                $available = self::availableDrivers([$driverId]);
                $d->update($available
                    ? ['driver_id' => Arr::random($available), 'reassigned_from_driver_id' => $driverId]
                    : ['driver_id' => null, 'status' => 'queued', 'reassigned_from_driver_id' => $driverId]);
            }

            return $pending->count();
        });
    }

    // Queued deliveries today, LIFO (latest ordered_at first), to the
    // available Drivers in the order they became free.
    public static function assignQueued(): int
    {
        $today = DriverAvailability::today();

        return DB::transaction(function () use ($today) {
            $queued = Delivery::where('status', 'queued')
                ->whereDate('scheduled_date', $today)
                ->orderByDesc('ordered_at')->orderByDesc('id')
                ->lockForUpdate()
                ->get();
            if ($queued->isEmpty()) {
                return 0;
            }

            $drivers = self::availableDrivers();
            if (! $drivers) {
                return 0;
            }

            foreach ($queued as $i => $d) {
                $d->update(['driver_id' => $drivers[$i % count($drivers)], 'status' => 'pending']);
            }

            return $queued->count();
        });
    }

    // Called by the live-feed poll; does the work at most every 15 seconds.
    // The poll's user is set aside while it runs, so the notices it causes go
    // to everyone concerned, the poller included.
    public static function run(): void
    {
        if (! Cache::add('delivery-dispatch-run', 1, 15)) {
            return;
        }

        $user = Auth::user();
        Auth::forgetUser();
        try {
            $today = DriverAvailability::today();
            foreach (array_keys(self::offDrivers($today)) as $driverId) {
                self::reassign((int) $driverId, $today);
            }
            self::assignQueued();
            self::sendDelayNotices();
        } catch (Throwable $e) {
            Log::warning('DeliveryDispatch: '.$e->getMessage());
        } finally {
            if ($user) {
                Auth::setUser($user);
            }
        }
    }

    // A reassigned or queued delivery today tells its store it may be late,
    // delivery.delay_notice_hours before it is due (a one-off delivery with no
    // due time: right away). Once per delivery.
    public static function sendDelayNotices(): int
    {
        $hours = (int) Settings::get('delivery.delay_notice_hours');
        $due = Delivery::with('customer')
            ->whereDate('scheduled_date', DriverAvailability::today())
            ->whereIn('status', ['pending', 'queued'])
            ->whereNotNull('reassigned_from_driver_id')
            ->whereDoesntHave('notifications')
            ->get();

        $sent = 0;
        foreach ($due as $d) {
            $sendAt = $d->contract_id && $d->ordered_at ? $d->ordered_at->copy()->subHours($hours) : now();
            if (now()->lt($sendAt)) {
                continue;
            }
            self::notifyDelay($d);
            $sent++;
        }

        return $sent;
    }

    // Every channel the store has: the customer portal (a live notice and the
    // list on its Deliveries page) and email. SMS needs an SMS provider, which
    // the system does not have yet. A store with no channel is marked "none".
    public static function notifyDelay(Delivery $d): void
    {
        $customer = $d->customer;
        if (! $customer) {
            return;
        }

        $when = $d->ordered_at && $d->contract_id ? ' (due '.$d->ordered_at->format('g:i A').')' : '';
        $message = "Your delivery {$d->delivery_no} today{$when} may be delayed: it was moved to another driver.";
        $channels = [];

        if ($customer->user_id) {
            LiveEvent::create([
                'module' => 'deliveries',
                'action' => 'updated',
                'message' => mb_substr($message, 0, 255),
                'roles' => [],
                'user_ids' => [$customer->user_id],
                'actor_id' => null,
            ]);
            $channels[] = 'portal';
        }

        if ($customer->email) {
            try {
                Mail::to($customer->email)->send(new DeliveryDelayNotice($customer->name, $d->delivery_no, $message));
                $channels[] = 'email';
            } catch (Throwable $e) {
                Log::warning("Delay notice email for {$d->delivery_no} failed: ".$e->getMessage());
            }
        }

        foreach ($channels ?: ['none'] as $channel) {
            DeliveryNotification::firstOrCreate(
                ['delivery_id' => $d->id, 'channel' => $channel],
                ['customer_id' => $customer->id, 'message' => mb_substr($message, 0, 255), 'sent_at' => now()]
            );
        }
    }

    // Stores in the contract that have no price for one of its products.
    public static function missingPrices(DeliveryContract $contract): array
    {
        $missing = [];
        foreach ($contract->stores as $store) {
            foreach ($contract->items as $item) {
                if (CustomerPrice::priceFor($store->id, $item['product_type']) === null) {
                    $missing[$store->name][] = $item['product_type'];
                }
            }
        }

        return $missing;
    }

    // Dates from the later of the start date and today to the end date that
    // fall on one of the contract's delivery days.
    public static function dates(DeliveryContract $contract): array
    {
        $from = max($contract->start_date->toDateString(), DriverAvailability::today());
        $to = $contract->end_date->toDateString();
        if ($from > $to) {
            return [];
        }

        $days = $contract->delivery_days ?? [];
        $out = [];
        foreach (CarbonPeriod::create($from, $to) as $day) {
            if (in_array(strtolower($day->format('D')), $days, true)) {
                $out[] = $day->toDateString();
            }
        }

        return $out;
    }

    // The daily deliveries of an approved contract: one per store per delivery
    // day, skipping a store that already has a delivery that day. Model events
    // are off while they are made, so one notice says how many there are
    // instead of one per delivery.
    public static function generate(DeliveryContract $contract, int $preparedBy): array
    {
        $dates = self::dates($contract);
        $stores = $contract->stores()->get(['customers.id', 'customers.name']);
        if (! $dates || $stores->isEmpty()) {
            return ['created' => 0, 'skipped' => 0];
        }

        $booked = Delivery::whereIn('customer_id', $stores->pluck('id'))
            ->whereBetween('scheduled_date', [reset($dates), end($dates)])
            ->where('status', '!=', 'cancelled')
            ->where('is_top_up', false) // an urgent top-up never takes the store's day
            ->get(['customer_id', 'scheduled_date'])
            ->map(fn ($d) => $d->customer_id.'|'.$d->scheduled_date->toDateString())
            ->flip();

        $prices = [];
        foreach ($stores as $store) {
            foreach ($contract->items as $item) {
                $prices[$store->id][$item['product_type']] = CustomerPrice::priceFor($store->id, $item['product_type']);
            }
        }

        $time = substr((string) $contract->delivery_time, 0, 5) ?: '08:00';
        $created = 0;
        $skipped = 0;
        $drivers = [];

        Delivery::withoutEvents(function () use ($contract, $dates, $stores, $booked, $prices, $time, $preparedBy, &$created, &$skipped, &$drivers) {
            DB::transaction(function () use ($contract, $dates, $stores, $booked, $prices, $time, $preparedBy, &$created, &$skipped, &$drivers) {
                $no = self::lastDeliveryNumber();
                foreach ($dates as $date) {
                    foreach ($stores as $store) {
                        if (isset($booked[$store->id.'|'.$date])) {
                            $skipped++;

                            continue;
                        }
                        $driverId = DriverStoreAssignment::driverFor($store->id, $date);
                        $delivery = Delivery::create([
                            'delivery_no' => self::formatDeliveryNo(++$no),
                            'contract_id' => $contract->id,
                            'driver_id' => $driverId,
                            'customer_id' => $store->id,
                            'delivery_type' => 'outbound',
                            'status' => 'pending',
                            'scheduled_date' => $date,
                            'ordered_at' => Carbon::parse("{$date} {$time}"),
                            'notes' => "Contract {$contract->contract_no}",
                            'prepared_by' => $preparedBy,
                        ]);
                        foreach ($contract->items as $item) {
                            $delivery->items()->create([
                                'product_type' => $item['product_type'],
                                'quantity_ordered' => $item['quantity'],
                                'unit_price' => $prices[$store->id][$item['product_type']],
                            ]);
                        }
                        $created++;
                        if ($driverId) {
                            $drivers[$driverId] = true;
                        }
                    }
                }
            });
        });

        if ($created > 0) {
            LiveEvent::create([
                'module' => 'deliveries',
                'action' => 'created',
                'message' => "Contract {$contract->contract_no} ({$contract->name}) approved: {$created} deliveries scheduled",
                'roles' => ['employee:salesman', 'employee:checker'],
                'user_ids' => array_keys($drivers),
                'actor_id' => Auth::id(),
            ]);
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    // A new store assignment applies to that store's pending deliveries from
    // its first day (today at the earliest) to its last. A delivery that was
    // reassigned because of a leave keeps its new Driver.
    public static function applyAssignment(DriverStoreAssignment $a): int
    {
        $from = max($a->effective_from->toDateString(), DriverAvailability::today());
        $q = Delivery::where('customer_id', $a->store_id)
            ->where('status', 'pending')
            ->whereNull('reassigned_from_driver_id')
            ->whereDate('scheduled_date', '>=', $from);
        if ($a->effective_to) {
            $q->whereDate('scheduled_date', '<=', $a->effective_to->toDateString());
        }

        // Query update: no notice per delivery (the controller sends one).
        return $q->update(['driver_id' => $a->driver_id, 'updated_at' => now()]);
    }

    // Highest DEL-0000 number so far. LIKE + a PHP check instead of REGEXP,
    // which SQLite (local dev) does not have. Past 9999 the numbers get longer.
    public static function lastDeliveryNumber(): int
    {
        return (int) Delivery::withTrashed()
            ->where('delivery_no', 'like', 'DEL-%')
            ->pluck('delivery_no')
            ->filter(fn ($no) => preg_match('/^DEL-\d{4,}$/', $no))
            ->map(fn ($no) => (int) substr($no, 4))
            ->max();
    }

    public static function formatDeliveryNo(int $n): string
    {
        return 'DEL-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    public static function storeIdsForChain(string $chain): array
    {
        return Customer::where('chain', $chain)->where('is_active', true)->pluck('id')->all();
    }
}
