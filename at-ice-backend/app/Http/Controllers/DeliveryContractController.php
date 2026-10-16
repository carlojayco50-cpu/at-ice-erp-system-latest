<?php

namespace App\Http\Controllers;

use App\Models\Delivery;
use App\Models\DeliveryContract;
use App\Support\Audit;
use App\Support\DeliveryDispatch;
use App\Support\DriverAvailability;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// Admin > Deliveries > Contracts: one delivery schedule per customer (a whole
// chain such as SM, or a single store) with a date range and delivery days.
// Approving it makes the daily deliveries (App\Support\DeliveryDispatch).
class DeliveryContractController extends Controller
{
    public function index()
    {
        $contracts = DeliveryContract::with(['stores:customers.id,customers.name,customers.chain,customers.branch_code', 'approvedBy:id,name'])
            ->withCount(['deliveries', 'deliveries as delivered_count' => fn ($q) => $q->where('status', 'delivered')])
            ->latest()
            ->get();

        return response()->json($contracts->map(fn ($c) => $c->toArray() + [
            'planned' => count(DeliveryDispatch::dates($c)) * $c->stores->count(),
        ]));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'chain' => 'nullable|string|max:100',
            'store_ids' => 'required|array|min:1',
            'store_ids.*' => 'integer|distinct|exists:customers,id',
            'start_date' => 'required|date|after_or_equal:today',
            'end_date' => 'required|date|after_or_equal:start_date|before_or_equal:'.now()->addYear()->toDateString(),
            'delivery_days' => 'required|array|min:1',
            'delivery_days.*' => ['string', 'distinct', Rule::in(DeliveryContract::DAYS)],
            'delivery_time' => ['required', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'items' => 'required|array|min:1',
            'items.*.product_type' => 'required|distinct|in:bags,small_sack,big_sack',
            'items.*.quantity' => 'required|integer|min:1|max:100000',
            'notes' => 'nullable|string|max:1000',
        ], [
            'store_ids.required' => 'Pick at least one store.',
            'delivery_days.required' => 'Pick at least one delivery day.',
            'end_date.before_or_equal' => 'A contract can run for at most one year.',
            'items.*.product_type.distinct' => 'Each product can only be added once.',
        ]);

        $contract = DB::transaction(function () use ($data, $request) {
            $last = DeliveryContract::where('contract_no', 'like', 'C-%')->pluck('contract_no')
                ->map(fn ($n) => (int) substr($n, 2))->max() ?? 0;
            $contract = DeliveryContract::create([
                'contract_no' => 'C-'.str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT),
                'name' => $data['name'],
                'chain' => $data['chain'] ?? null,
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                // kept in Mon..Sun order
                'delivery_days' => array_values(array_intersect(DeliveryContract::DAYS, $data['delivery_days'])),
                'delivery_time' => $data['delivery_time'].':00',
                'items' => array_map(fn ($i) => ['product_type' => $i['product_type'], 'quantity' => (int) $i['quantity']], $data['items']),
                'notes' => $data['notes'] ?? null,
                'status' => 'pending',
                'created_by' => $request->user()->id,
            ]);
            $contract->stores()->sync($data['store_ids']);

            return $contract;
        });

        Audit::log('delivery_contract.created', $contract, null, $contract->only(['contract_no', 'name', 'start_date', 'end_date', 'delivery_days']));

        return response()->json($contract->load('stores:customers.id,customers.name'), 201);
    }

    // Admin approves: the daily deliveries are generated at once.
    public function approve(Request $request, $id)
    {
        $contract = DeliveryContract::with('stores')->findOrFail($id);
        if ($contract->status !== 'pending') {
            return response()->json(['message' => 'Only a pending contract can be approved.'], 422);
        }
        if ($contract->end_date->toDateString() < DriverAvailability::today()) {
            return response()->json(['message' => 'This contract has already ended. Make a new one with new dates.'], 422);
        }

        $missing = DeliveryDispatch::missingPrices($contract);
        if ($missing) {
            $list = collect($missing)->map(fn ($types, $store) => $store.' ('.implode(', ', $types).')')->implode('; ');

            return response()->json([
                'message' => "No price is set for: {$list}. Set them in Customer Prices first.",
                'missing_prices' => $missing,
            ], 422);
        }

        $contract->update(['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()]);
        $result = DeliveryDispatch::generate($contract, $request->user()->id);
        Audit::log('delivery_contract.approved', $contract, ['status' => 'pending'], ['status' => 'approved'] + $result);

        $text = "{$result['created']} deliveries were scheduled.";
        if ($result['skipped']) {
            $text .= " {$result['skipped']} were skipped because the store already has a delivery that day.";
        }

        return response()->json(['message' => $text] + $result);
    }

    // Cancels the contract and its deliveries from today on that have not
    // started yet. Deliveries in transit or delivered are kept.
    public function cancel($id)
    {
        $contract = DeliveryContract::findOrFail($id);
        if ($contract->status === 'cancelled') {
            return response()->json(['message' => 'This contract is already cancelled.'], 422);
        }

        $count = Delivery::where('contract_id', $contract->id)
            ->whereIn('status', ['pending', 'queued'])
            ->whereDate('scheduled_date', '>=', DriverAvailability::today())
            ->update(['status' => 'cancelled', 'cancel_reason' => "Contract {$contract->contract_no} cancelled", 'updated_at' => now()]);
        $before = $contract->status;
        $contract->update(['status' => 'cancelled']);
        Audit::log('delivery_contract.cancelled', $contract, ['status' => $before], ['status' => 'cancelled', 'deliveries_cancelled' => $count]);

        return response()->json(['message' => "Contract cancelled. {$count} upcoming deliveries were cancelled."]);
    }
}
