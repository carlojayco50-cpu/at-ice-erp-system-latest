<?php

namespace App\Http\Controllers;

use App\Events\DeliveryStatusUpdated;
use App\Models\Customer;
use App\Models\CustomerPrice;
use App\Models\Delivery;
use App\Models\DeliveryItem;
use App\Models\DriverStoreAssignment;
use App\Models\User;
use App\Support\Audit;
use App\Support\DeliveryAdjust;
use App\Support\DeliveryDispatch;
use App\Support\DriverAvailability;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DeliveryController extends Controller
{
    // ?from=&to= limit it to scheduled dates (contracts make many deliveries).
    public function index(Request $request)
    {
        $q = Delivery::with(['driver', 'customer', 'supplier', 'items.product', 'proofs', 'reassignedFrom:id,name', 'contract:id,contract_no,name'])
            ->latest();
        if ($from = $request->query('from')) {
            $q->whereDate('scheduled_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('scheduled_date', '<=', $to);
        }

        return response()->json($q->get());
    }

    // Admin Deliveries page, Driver View and Store View for one day: every
    // Driver with status (today only), whether they are off, their regular
    // stores, and the day's deliveries (including those with no driver yet
    // and the queue).
    public function board(Request $request)
    {
        $date = $request->query('date') ?: DriverAvailability::today();
        $date = Carbon::parse($date)->toDateString();
        $isToday = $date === DriverAvailability::today();

        // queued and unassigned ones still need a driver whatever the day
        if ($isToday) {
            DeliveryDispatch::assignQueued();
        }

        $off = DeliveryDispatch::offDrivers($date);
        $status = $isToday ? collect(DriverAvailability::all())->keyBy('id') : collect();
        $drivers = User::where('role', 'driver')->with('employee')
            ->orderBy('name')->get(['id', 'name']);

        $assignments = DriverStoreAssignment::activeOn($date)->with('store:id,name,chain,branch_code')->get()->groupBy('driver_id');

        $deliveries = Delivery::with(['customer:id,name,chain,branch_code,city', 'items', 'reassignedFrom:id,name', 'driver:id,name', 'contract:id,contract_no,name', 'proofs:id,delivery_id,photo_path,confirmed_at'])
            ->whereDate('scheduled_date', $date)
            ->where('delivery_type', 'outbound')
            ->orderBy('ordered_at')->orderBy('id')
            ->get();

        return response()->json([
            'date' => $date,
            'today' => DriverAvailability::today(),
            'drivers' => $drivers->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->employee?->full_name ?: $u->name,
                'employee_id' => $u->employee?->employee_id,
                'vehicle_plate' => $u->employee?->vehicle_plate,
                'status' => isset($off[$u->id]) ? 'off' : ($status[$u->id]['status'] ?? null),
                'reason' => $off[$u->id] ?? ($status[$u->id]['reason'] ?? null),
                'stores' => ($assignments[$u->id] ?? collect())->map(fn ($a) => [
                    'assignment_id' => $a->id,
                    'id' => $a->store_id,
                    'name' => $a->store?->name,
                    'branch_code' => $a->store?->branch_code,
                    'chain' => $a->store?->chain,
                    'effective_from' => $a->effective_from?->toDateString(),
                    'effective_to' => $a->effective_to?->toDateString(),
                ])->values(),
            ])->values(),
            'deliveries' => $deliveries,
        ]);
    }

    // Admin edits a delivery that has not started: its Driver (or none),
    // quantities and notes. Status is set by the Driver and the Salesman.
    public function update(Request $request, $id)
    {
        $data = $request->validate([
            'driver_id' => ['nullable', Rule::exists('users', 'id')->where('role', 'driver')],
            'notes' => 'nullable|string|max:1000',
            'items' => 'sometimes|array|min:1',
            'items.*.product_type' => 'required_with:items|distinct|in:bags,small_sack,big_sack',
            'items.*.quantity_ordered' => 'required_with:items|integer|min:1|max:'.config('atice.max_product_quantity'),
        ], [
            'driver_id.exists' => 'Please select a driver.',
            'items.*.quantity_ordered.max' => 'Each product can have at most '.config('atice.max_product_quantity').' on one delivery. Add another delivery for more.',
        ]);

        $delivery = Delivery::with('items')->findOrFail($id);
        if (! in_array($delivery->status, ['pending', 'queued'], true)) {
            return response()->json(['message' => 'Only a delivery that has not started can be edited.'], 422);
        }

        $driverId = array_key_exists('driver_id', $data) ? ($data['driver_id'] ? (int) $data['driver_id'] : null) : $delivery->driver_id;
        if ($driverId && $driverId !== $delivery->driver_id
            && ($why = DriverAvailability::refusal($driverId, $delivery->scheduled_date->toDateString()))) {
            return response()->json(['message' => $why, 'errors' => ['driver_id' => [$why]]], 422);
        }

        $prices = [];
        if (isset($data['items'])) {
            foreach ($data['items'] as $item) {
                $price = $delivery->customer_id ? CustomerPrice::priceFor($delivery->customer_id, $item['product_type']) : null;
                if ($price === null) {
                    return response()->json(['message' => "No price has been set for this customer for {$item['product_type']}. Set it in Customer Prices first."], 422);
                }
                $prices[$item['product_type']] = $price;
            }
        }

        $before = ['driver_id' => $delivery->driver_id, 'items' => $delivery->items->map->only(['product_type', 'quantity_ordered'])->all()];
        DB::transaction(function () use ($delivery, $data, $driverId, $prices) {
            $delivery->update([
                'driver_id' => $driverId,
                // a queued delivery given a driver is back to pending
                'status' => $driverId ? 'pending' : $delivery->status,
                'notes' => array_key_exists('notes', $data) ? $data['notes'] : $delivery->notes,
            ]);
            if (isset($data['items'])) {
                $delivery->items()->delete();
                foreach ($data['items'] as $item) {
                    $delivery->items()->create([
                        'product_type' => $item['product_type'],
                        'quantity_ordered' => $item['quantity_ordered'],
                        'unit_price' => $prices[$item['product_type']],
                    ]);
                }
            }
        });
        Audit::log('delivery.edited', $delivery, $before, ['driver_id' => $driverId] + (isset($data['items']) ? ['items' => $data['items']] : []));

        return response()->json($delivery->fresh(['driver:id,name', 'customer', 'items', 'reassignedFrom:id,name']));
    }

    // Admin: every Driver as available / in_transit / unavailable for the
    // driver picker (App\Support\DriverAvailability). `enforced` is false for
    // a later day, when any Driver may be picked.
    public function driverAvailability(Request $request)
    {
        return response()->json([
            'today' => DriverAvailability::today(),
            'enforced' => DriverAvailability::enforcedFor($request->query('date')),
            'drivers' => DriverAvailability::all(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:users,id',
            'customer_id' => 'required_if:delivery_type,outbound|nullable|exists:customers,id',
            'delivery_type' => 'required|in:outbound,inbound',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'scheduled_date' => 'required|date|after_or_equal:'.DriverAvailability::today(),
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_type' => 'required|in:bags,small_sack,big_sack',
            'items.*.quantity_ordered' => 'required|integer|min:1|max:'.config('atice.max_product_quantity'),
        ], [
            'customer_id.required_if' => 'Please select a customer.',
            'items.*.quantity_ordered.max' => 'Each product can have at most '.config('atice.max_product_quantity').' on one delivery. Add another delivery for more.',
        ]);

        // Only an available Driver (timed in today, not in transit) can be assigned.
        if ($why = DriverAvailability::refusal((int) $data['driver_id'], $data['scheduled_date'])) {
            return response()->json(['message' => $why, 'errors' => ['driver_id' => [$why]]], 422);
        }

        // Each product type only once per delivery
        $types = array_column($data['items'], 'product_type');
        if (count($types) !== count(array_unique($types))) {
            return response()->json([
                'message' => 'Each product can only be added once per delivery.',
            ], 422);
        }

        // Unit price comes from Customer Prices, so the delivery and the
        // receipt the Salesman generates always use the same price.
        $items = [];
        $missing = [];
        foreach ($data['items'] as $item) {
            $price = $data['customer_id']
                ? CustomerPrice::priceFor($data['customer_id'], $item['product_type'])
                : null;

            if ($price === null) {
                $missing[] = $item['product_type'];

                continue;
            }

            $items[] = [
                'product_type' => $item['product_type'],
                'quantity_ordered' => $item['quantity_ordered'],
                'unit_price' => $price,
            ];
        }

        if (! empty($missing)) {
            return response()->json([
                'message' => 'No price has been set for this customer for: '
                    .implode(', ', $missing)
                    .'. Please set it in Customer Prices first.',
                'missing_price_products' => $missing,
            ], 422);
        }

        $data['prepared_by'] = Auth::id();
        unset($data['items']);

        // Retried when two deliveries made at the same moment get the same number.
        for ($attempt = 1; ; $attempt++) {
            try {
                $delivery = DB::transaction(function () use ($data, $items) {
                    // No double booking: one delivery per customer per day. Only a
                    // cancelled one frees the day. The customer row is locked so two
                    // Admins booking the same day at the same moment cannot both pass.
                    if (! empty($data['customer_id'])) {
                        Customer::whereKey($data['customer_id'])->lockForUpdate()->first();
                        $booked = Delivery::where('customer_id', $data['customer_id'])
                            ->whereDate('scheduled_date', $data['scheduled_date'])
                            ->where('status', '!=', 'cancelled')
                            ->where('is_top_up', false)
                            ->first();
                        if ($booked) {
                            return $booked;
                        }
                    }

                    $delivery = Delivery::create($data + ['delivery_no' => self::nextDeliveryNo(), 'ordered_at' => now()]);

                    foreach ($items as $item) {
                        $delivery->items()->create($item);
                    }

                    return $delivery;
                });
                break;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 3) {
                    throw $e;
                }
            }
        }

        // An existing booking came back instead of a new delivery.
        if (! $delivery->wasRecentlyCreated) {
            $day = Carbon::parse($data['scheduled_date'])->format('M j, Y');
            $text = "This customer already has delivery {$delivery->delivery_no} ({$delivery->status}) on {$day}. Cancel it first, or pick another date.";

            return response()->json(['message' => $text, 'errors' => ['scheduled_date' => [$text]]], 422);
        }

        return response()->json($delivery->load(['driver', 'customer', 'items.product']), 201);
    }

    // Highest DEL-0000 number so far, plus 1 (contracts use the same numbers).
    private static function nextDeliveryNo(): string
    {
        return DeliveryDispatch::formatDeliveryNo(DeliveryDispatch::lastDeliveryNumber() + 1);
    }

    public function show($id)
    {
        return response()->json(
            Delivery::with(['driver', 'customer', 'supplier', 'items.product', 'proofs', 'preparedBy', 'parent:id,delivery_no', 'topUps:id,parent_delivery_id,delivery_no,status,ordered_at', 'adjustments.user:id,name'])->findOrFail($id)
        );
    }

    // POST /api/deliveries/{id}/top-up (Admin): another delivery today to the
    // same store, by a later time (App\Support\DeliveryAdjust::topUp)
    public function topUp(Request $request, $id)
    {
        $data = $request->validate([
            'items' => 'required|array',
            'items.*' => 'integer|min:0|max:'.config('atice.max_product_quantity'),
            'deliver_by' => 'required|date_format:H:i',
            'notes' => 'nullable|string|max:200',
        ]);
        $parent = Delivery::with('customer')->findOrFail($id);
        $items = array_intersect_key($data['items'], DeliveryItem::PRODUCT_TYPES);

        $delivery = DeliveryAdjust::topUp($parent, $items, $data['deliver_by'], 'admin', $data['notes'] ?? null);

        return response()->json($delivery->load(['driver', 'customer', 'items']), 201);
    }

    // POST /api/deliveries/{id}/adjust (Admin): add or reduce sacks on a
    // delivery not yet delivered, by a count or a percentage, with a reason
    public function adjust(Request $request, $id)
    {
        $data = $request->validate([
            'mode' => 'required|in:add,reduce',
            'by' => 'required|in:count,percent',
            'value' => 'required|integer|min:1|max:'.config('atice.max_product_quantity'),
            'product_type' => ['nullable', Rule::in(array_keys(DeliveryItem::PRODUCT_TYPES))],
            'reason' => 'required|string|min:3|max:200',
        ]);
        $delivery = Delivery::findOrFail($id);
        $record = DeliveryAdjust::adjust($delivery, $data['mode'], $data['by'], $data['value'], $data['product_type'] ?? null, trim($data['reason']));
        if (! $record) {
            return response()->json(['message' => 'Nothing changed: the amount rounds to zero sacks.'], 422);
        }

        return $this->show($id);
    }

    // A delivery in transit can only be cancelled for a real emergency, with
    // the reason written down (audited).
    public function cancel(Request $request, $id)
    {
        $reason = trim((string) $request->input('reason', ''));

        // Locked so a cancel cannot cross a Salesman confirmation in progress
        // (DeliveryProofController@confirm locks the same row).
        [$status, $error] = DB::transaction(function () use ($id, $reason) {
            $delivery = Delivery::lockForUpdate()->findOrFail($id);
            if (in_array($delivery->status, ['delivered', 'cancelled'], true)) {
                return [$delivery->status, "This delivery is already {$delivery->status}."];
            }
            if ($delivery->status === 'in_transit' && mb_strlen($reason) < 5) {
                return [$delivery->status, 'This delivery is in transit. It can only be cancelled for an emergency: write what happened.'];
            }
            $was = $delivery->status;
            $delivery->update(['status' => 'cancelled', 'cancel_reason' => $reason ?: null]);
            if ($was === 'in_transit') {
                Audit::log('delivery.emergency_cancel', $delivery, ['status' => $was], ['status' => 'cancelled', 'reason' => $reason]);
            }

            return ['cancelled', null];
        });

        if ($error) {
            return response()->json(['message' => $error, 'errors' => ['reason' => [$error]]], 422);
        }

        return response()->json(['message' => 'Delivery cancelled']);
    }

    // Driver: can only START a delivery (pending to in_transit).
    // "Delivered" is set by the Salesman through DeliveryProofController@confirm.
    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:in_transit',
        ]);

        $delivery = Delivery::with(['customer', 'items.product', 'proofs'])->findOrFail($id);

        if ($delivery->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($delivery->status !== 'pending') {
            return response()->json(['message' => 'Only pending deliveries can be started.'], 422);
        }

        $delivery->update([
            'status' => 'in_transit',
            'dispatched_at' => now(),
        ]);

        broadcast(new DeliveryStatusUpdated([
            'delivery_id' => $delivery->id,
            'delivery_no' => $delivery->delivery_no,
            'driver_id' => $delivery->driver_id,
            'customer' => $delivery->customer?->name ?? 'Unknown',
            'status' => 'in_transit',
            'message' => "Delivery {$delivery->delivery_no} is now in_transit.",
        ]))->toOthers();

        return response()->json([
            'message' => 'Delivery status updated!',
            'delivery' => $delivery,
        ]);
    }

    // Salesman: view assigned deliveries (not yet confirmed)
    public function myDeliveries(Request $request)
    {
        $deliveries = Delivery::with(['driver', 'customer', 'items.product'])
            ->where('status', 'pending')
            ->whereDoesntHave('proofs')
            ->get();

        return response()->json($deliveries);
    }

    // Driver: view assigned deliveries
    public function driverDeliveries(Request $request)
    {
        // Contracts schedule weeks ahead: upcoming ones up to 7 days out, and
        // the last 30 days of delivered ones.
        $today = DriverAvailability::today();
        $deliveries = Delivery::with(['customer', 'items.product', 'proofs', 'reassignedFrom:id,name'])
            ->where('driver_id', $request->user()->id)
            ->where(fn ($q) => $q
                ->where('status', 'in_transit')
                ->orWhere(fn ($p) => $p->where('status', 'pending')->whereDate('scheduled_date', '<=', Carbon::parse($today)->addDays(7)->toDateString()))
                ->orWhere(fn ($d) => $d->where('status', 'delivered')->whereDate('scheduled_date', '>=', Carbon::parse($today)->subDays(30)->toDateString())))
            ->orderBy('scheduled_date', 'asc')
            ->orderBy('ordered_at', 'asc')
            ->get();

        return response()->json($deliveries);
    }
}
