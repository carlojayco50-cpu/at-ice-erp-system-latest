<?php

namespace App\Support;

use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryAdjustment;
use App\Models\DeliveryAdjustmentRequest;
use App\Models\DeliveryItem;
use App\Models\DriverStoreAssignment;
use App\Models\LiveEvent;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// Same-day changes to deliveries (2026-10-22).
//
// Urgent top-up: a store that already got (or is getting) today's delivery
// runs out and asks for more by a later time. The top-up is its own one-off
// delivery (is_top_up, parent_delivery_id), so the morning delivery and its
// invoice never change; it is not blocked by the one-delivery-per-day rule or
// by contract generation. Its Driver is the store's Driver if available, else
// the first available Driver, else it is queued for the next free one.
//
// Add / reduce sacks: on one store's delivery not yet delivered (pending,
// queued or in transit), never on many stores at once (owner, 2026-10-22: no
// day-wide cut). Either the store asks in the portal and Admin applies or
// declines the request (DeliveryAdjustmentRequest), or the store asks Admin
// directly and Admin changes it, by a number of sacks or a percentage. A
// reason is always written down and audited. The Salesman's confirmation
// starts from the new quantities, so the invoice follows. Ice is not tracked
// in Inventory, so nothing is reserved or returned there.
class DeliveryAdjust
{
    public const OPEN = ['pending', 'queued', 'in_transit'];

    // The most of one product on one delivery (config/atice.php), the same limit as
    // New Delivery, Ice Loading and the Salesman's confirmation.
    private static function withinLimit(array $quantities, string $field): void
    {
        $max = (int) config('atice.max_product_quantity');
        if ($quantities && max($quantities) > $max) {
            throw ValidationException::withMessages([$field => "Each product can have at most {$max} on one delivery."]);
        }
    }

    // items: [product_type => sacks]
    public static function topUp(Delivery $parent, array $items, string $deliverBy, string $source, ?string $notes = null): Delivery
    {
        $today = DriverAvailability::today();
        if (! $parent->customer_id || $parent->status === 'cancelled' || $parent->scheduled_date->toDateString() !== $today) {
            throw ValidationException::withMessages(['delivery' => 'A top-up follows one of today\'s deliveries to this store.']);
        }
        $due = Carbon::parse("{$today} {$deliverBy}", DriverAvailability::tz());
        if ($due->lte(Carbon::now(DriverAvailability::tz())->addMinutes(30))) {
            throw ValidationException::withMessages(['deliver_by' => 'Pick a time at least 30 minutes from now.']);
        }
        $max = (int) Settings::get('delivery.max_top_ups_per_day');
        $already = Delivery::where('parent_delivery_id', $parent->id)->where('status', '!=', 'cancelled')->count();
        if ($already >= $max) {
            throw ValidationException::withMessages(['items' => "This store already has {$max} top-ups today. Call the dispatch hotline for more."]);
        }

        $rows = [];
        foreach ($items as $type => $qty) {
            if ($qty < 1) {
                continue;
            }
            $price = CustomerPrice::priceFor($parent->customer_id, $type);
            if ($price === null) {
                throw ValidationException::withMessages(['items' => 'No price is set for '.(DeliveryItem::PRODUCT_TYPES[$type] ?? $type).'. Set it in Customer Prices first.']);
            }
            $rows[] = ['product_type' => $type, 'quantity_ordered' => (int) $qty, 'unit_price' => $price];
        }
        if (! $rows) {
            throw ValidationException::withMessages(['items' => 'Add at least one sack.']);
        }
        self::withinLimit(array_column($rows, 'quantity_ordered'), 'items');

        $driverId = self::driverForTopUp($parent->customer_id, $today);

        $delivery = DB::transaction(function () use ($parent, $rows, $due, $driverId, $source, $notes, $today) {
            $delivery = Delivery::create([
                'delivery_no' => DeliveryDispatch::formatDeliveryNo(DeliveryDispatch::lastDeliveryNumber() + 1),
                'customer_id' => $parent->customer_id,
                'delivery_type' => 'outbound',
                'driver_id' => $driverId,
                'status' => $driverId ? 'pending' : 'queued',
                'scheduled_date' => $today,
                'ordered_at' => $due->copy()->setTimezone(config('app.timezone')),
                'parent_delivery_id' => $parent->id,
                'is_top_up' => true,
                'notes' => trim("Urgent top-up after {$parent->delivery_no}. ".($notes ?? '')),
                'prepared_by' => Auth::id(),
            ]);
            foreach ($rows as $row) {
                $delivery->items()->create($row);
            }
            DeliveryAdjustment::create([
                'delivery_id' => $delivery->id,
                'kind' => 'top_up',
                'source' => $source,
                'reason' => mb_substr("Top-up after {$parent->delivery_no}".($notes ? ": {$notes}" : ''), 0, 255),
                'changes' => array_map(fn ($r) => ['product_type' => $r['product_type'], 'before' => 0, 'after' => $r['quantity_ordered']], $rows),
                'user_id' => Auth::id(),
            ]);

            return $delivery;
        });

        Audit::log('delivery.top_up', $delivery, null, ['parent' => $parent->delivery_no, 'items' => $items, 'deliver_by' => $deliverBy, 'source' => $source]);
        LiveEvent::create([
            'module' => 'deliveries',
            'action' => 'created',
            'message' => "URGENT top-up {$delivery->delivery_no} for ".($parent->customer?->name ?? 'a store').' by '.$due->format('g:i A').($driverId ? '' : ' (queued, no Driver free yet)'),
            'roles' => ['employee:salesman'],
            'user_ids' => array_values(array_filter([$driverId])),
            'actor_id' => Auth::id(),
        ]);

        return $delivery;
    }

    // mode add|reduce, by count|percent; productType null = every product
    public static function adjust(Delivery $delivery, string $mode, string $by, int $value, ?string $productType, string $reason, string $source = 'admin'): ?DeliveryAdjustment
    {
        if (! in_array($delivery->status, self::OPEN, true)) {
            throw ValidationException::withMessages(['delivery' => "{$delivery->delivery_no} is {$delivery->status}; only a delivery not yet delivered can change."]);
        }
        if ($by === 'percent' && ($value < 1 || $value > 100)) {
            throw ValidationException::withMessages(['value' => 'The percentage must be from 1 to 100.']);
        }

        return DB::transaction(function () use ($delivery, $mode, $by, $value, $productType, $reason, $source) {
            $items = $delivery->items()->lockForUpdate()->get();
            $changes = [];
            foreach ($items as $item) {
                if ($productType && $item->product_type !== $productType) {
                    continue;
                }
                $before = (int) $item->quantity_ordered;
                $delta = $by === 'percent' ? (int) round($before * $value / 100) : $value;
                $after = $mode === 'add' ? $before + $delta : max(0, $before - $delta);
                if ($after !== $before) {
                    $changes[] = ['item' => $item, 'product_type' => $item->product_type, 'before' => $before, 'after' => $after];
                }
            }
            if ($productType && ! $items->contains('product_type', $productType)) {
                if ($mode === 'reduce' || $by === 'percent') {
                    throw ValidationException::withMessages(['product_type' => 'This delivery has no '.(DeliveryItem::PRODUCT_TYPES[$productType] ?? $productType).'.']);
                }
                // adding sacks of a product the delivery did not have yet
                $price = CustomerPrice::priceFor($delivery->customer_id, $productType);
                if ($price === null) {
                    throw ValidationException::withMessages(['product_type' => 'No price is set for this product. Set it in Customer Prices first.']);
                }
                $changes[] = ['item' => null, 'product_type' => $productType, 'before' => 0, 'after' => $value, 'price' => $price];
            }
            if (! $changes) {
                return null; // nothing to change (e.g. 10% of 3 sacks rounds to 0)
            }

            return self::applyChanges($delivery, $items, $changes, $reason, $source);
        });
    }

    // Writes the new quantities (inside the caller's transaction, items locked),
    // keeps the change, audits it and tells the Driver and the Salesmen.
    // $changes: [{item|null, product_type, before, after, price?}]
    private static function applyChanges(Delivery $delivery, $items, array $changes, string $reason, string $source): DeliveryAdjustment
    {
        self::withinLimit(array_column($changes, 'after'), 'value');
        $net = array_sum(array_map(fn ($c) => $c['after'] - $c['before'], $changes));
        if ($items->sum('quantity_ordered') + $net < 1) {
            throw ValidationException::withMessages(['value' => 'That would leave no sacks. Cancel the delivery instead.']);
        }
        $ups = count(array_filter($changes, fn ($c) => $c['after'] > $c['before']));
        $kind = $ups === count($changes) ? 'add' : ($ups === 0 ? 'reduce' : 'change');

        foreach ($changes as $c) {
            if ($c['item']) {
                $c['item']->update(['quantity_ordered' => $c['after']]);
            } else {
                $delivery->items()->create(['product_type' => $c['product_type'], 'quantity_ordered' => $c['after'], 'unit_price' => $c['price']]);
            }
        }

        $record = DeliveryAdjustment::create([
            'delivery_id' => $delivery->id,
            'kind' => $kind,
            'source' => $source,
            'reason' => mb_substr($reason, 0, 255),
            'changes' => array_map(fn ($c) => ['product_type' => $c['product_type'], 'before' => $c['before'], 'after' => $c['after']], $changes),
            'user_id' => Auth::id(),
        ]);
        Audit::log("delivery.{$kind}_sacks", $delivery, null, ['reason' => $reason, 'source' => $source, 'changes' => $record->changes]);

        LiveEvent::create([
            'module' => 'deliveries',
            'action' => 'updated',
            'message' => mb_substr("{$delivery->delivery_no}: sacks ".['add' => 'added', 'reduce' => 'reduced', 'change' => 'changed'][$kind]." ({$reason}): ".self::summary($record->changes), 0, 255),
            'roles' => ['employee:salesman'],
            'user_ids' => array_values(array_filter([$delivery->driver_id])),
            'actor_id' => Auth::id(),
        ]);

        return $record;
    }

    // "Bags (5kg) 25 → 15, Big Sack 4 → 2"
    public static function summary(array $changes): string
    {
        return implode(', ', array_map(fn ($c) => (DeliveryItem::PRODUCT_TYPES[$c['product_type']] ?? $c['product_type'])." {$c['before']} → {$c['after']}", $changes));
    }

    // The store asks to change the sacks on one of its open deliveries
    // (owner, 2026-10-22). $wanted: [product_type => sacks wanted]. Nothing
    // changes until Admin applies it; one open request per delivery.
    public static function requestChange(Delivery $delivery, Customer $customer, array $wanted, string $reason): DeliveryAdjustmentRequest
    {
        if (! in_array($delivery->status, self::OPEN, true)) {
            throw ValidationException::withMessages(['delivery' => "{$delivery->delivery_no} is already {$delivery->status}; only a delivery not yet delivered can change."]);
        }
        if (DeliveryAdjustmentRequest::where('delivery_id', $delivery->id)->where('status', 'pending')->exists()) {
            throw ValidationException::withMessages(['delivery' => 'You already asked to change this delivery. Wait for the answer, or withdraw that request first.']);
        }

        $current = $delivery->items()->get()->groupBy('product_type')->map(fn ($rows) => (int) $rows->sum('quantity_ordered'));
        $items = [];
        foreach ($wanted as $type => $after) {
            $after = (int) $after;
            $before = (int) ($current[$type] ?? 0);
            if ($after === $before) {
                continue;
            }
            if ($before === 0 && CustomerPrice::priceFor($customer->id, $type) === null) {
                throw ValidationException::withMessages(['items' => (DeliveryItem::PRODUCT_TYPES[$type] ?? $type).' is not priced for your store yet. Contact the plant to add it.']);
            }
            $items[] = ['product_type' => $type, 'before' => $before, 'after' => $after];
        }
        if (! $items) {
            throw ValidationException::withMessages(['items' => 'Change at least one quantity.']);
        }
        self::withinLimit(array_column($items, 'after'), 'items');
        if ($current->sum() + array_sum(array_map(fn ($i) => $i['after'] - $i['before'], $items)) < 1) {
            throw ValidationException::withMessages(['items' => 'That would leave no sacks. If you do not need this delivery, contact the plant to cancel it.']);
        }

        $request = DeliveryAdjustmentRequest::create([
            'delivery_id' => $delivery->id,
            'customer_id' => $customer->id,
            'items' => $items,
            'reason' => mb_substr($reason, 0, 255),
            'status' => 'pending',
            'requested_by' => Auth::id(),
        ]);
        Audit::log('delivery.adjustment_requested', $delivery, null, ['request_id' => $request->id, 'reason' => $reason, 'items' => $items]);
        LiveEvent::create([
            'module' => 'deliveries',
            'action' => 'created',
            'message' => mb_substr("{$customer->name} asks to change {$delivery->delivery_no}: ".self::summary($items)." ({$reason})", 0, 255),
            'roles' => [], // Admin sees every event
            'user_ids' => [],
            'actor_id' => Auth::id(),
        ]);

        return $request;
    }

    // Admin applies a store's request to its delivery: the quantities become
    // what the store asked for (counted from the delivery as it is now).
    public static function applyRequest(DeliveryAdjustmentRequest $request, ?string $note = null): DeliveryAdjustmentRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => "This request is already {$request->status}."]);
        }
        $delivery = $request->delivery;
        if (! in_array($delivery->status, self::OPEN, true)) {
            throw ValidationException::withMessages(['request' => "{$delivery->delivery_no} is already {$delivery->status}, so it cannot change. Decline the request with a note."]);
        }

        DB::transaction(function () use ($request, $delivery, $note) {
            $items = $delivery->items()->lockForUpdate()->get();
            $changes = [];
            foreach ($request->items as $wanted) {
                $rows = $items->where('product_type', $wanted['product_type']);
                $before = (int) $rows->sum('quantity_ordered');
                $after = (int) $wanted['after'];
                if ($before === $after) {
                    continue;
                }
                if ($rows->isEmpty()) {
                    $price = CustomerPrice::priceFor($delivery->customer_id, $wanted['product_type']);
                    if ($price === null) {
                        throw ValidationException::withMessages(['request' => 'No price is set for '.(DeliveryItem::PRODUCT_TYPES[$wanted['product_type']] ?? $wanted['product_type']).'. Set it in Customer Prices first.']);
                    }
                    $changes[] = ['item' => null, 'product_type' => $wanted['product_type'], 'before' => 0, 'after' => $after, 'price' => $price];
                } else {
                    // one line per product; an older delivery with two lines keeps the extra at 0
                    $first = $rows->first();
                    foreach ($rows->slice(1) as $extra) {
                        $extra->update(['quantity_ordered' => 0]);
                    }
                    $changes[] = ['item' => $first, 'product_type' => $wanted['product_type'], 'before' => $before, 'after' => $after];
                }
            }
            $record = $changes ? self::applyChanges($delivery, $items, $changes, "Store request: {$request->reason}", 'customer') : null;
            $request->update([
                'status' => 'applied',
                'review_note' => $note ? mb_substr($note, 0, 255) : null,
                'reviewed_by' => Auth::id(),
                'reviewed_at' => now(),
                'adjustment_id' => $record?->id,
            ]);
        });

        Audit::log('delivery.adjustment_request_applied', $delivery, null, ['request_id' => $request->id, 'note' => $note]);
        self::tellStore($request, "Your change to {$delivery->delivery_no} was applied: ".self::summary($request->items).'.'.($note ? " Note: {$note}" : ''));

        return $request->fresh();
    }

    // Admin declines a store's request; the reason is shown to the store.
    public static function declineRequest(DeliveryAdjustmentRequest $request, string $note): DeliveryAdjustmentRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => "This request is already {$request->status}."]);
        }
        $request->update(['status' => 'declined', 'review_note' => mb_substr($note, 0, 255), 'reviewed_by' => Auth::id(), 'reviewed_at' => now()]);
        Audit::log('delivery.adjustment_request_declined', $request->delivery, null, ['request_id' => $request->id, 'note' => $note]);
        self::tellStore($request, "Your change to {$request->delivery->delivery_no} was declined: {$note}");

        return $request->fresh();
    }

    // The store takes back its own request before Admin answers it.
    public static function withdrawRequest(DeliveryAdjustmentRequest $request): DeliveryAdjustmentRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => "This request is already {$request->status}."]);
        }
        $request->update(['status' => 'withdrawn']);
        Audit::log('delivery.adjustment_request_withdrawn', $request->delivery, null, ['request_id' => $request->id]);

        return $request->fresh();
    }

    private static function tellStore(DeliveryAdjustmentRequest $request, string $message): void
    {
        $userId = $request->customer?->user_id;
        if (! $userId) {
            return;
        }
        LiveEvent::create([
            'module' => 'deliveries',
            'action' => 'updated',
            'message' => mb_substr($message, 0, 255),
            'roles' => [],
            'user_ids' => [$userId],
            'actor_id' => Auth::id(),
        ]);
    }

    // The store's own Driver when available, else the Driver free longest,
    // else null (the top-up is queued for the next free Driver).
    public static function driverForTopUp(int $storeId, string $date): ?int
    {
        $available = DeliveryDispatch::availableDrivers();
        $own = DriverStoreAssignment::driverFor($storeId, $date);

        return $own && in_array($own, $available, false) ? (int) $own : ($available[0] ?? null);
    }
}
