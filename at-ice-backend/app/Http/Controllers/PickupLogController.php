<?php

namespace App\Http\Controllers;

use App\Models\PickupLog;
use Illuminate\Http\Request;

class PickupLogController extends Controller
{
    // GET /api/pickup-logs
    public function index(Request $request)
    {
        $query = PickupLog::with('recordedBy:id,name')
            ->orderBy('pickup_date', 'desc');

        if ($request->filled('company_name')) {
            $query->where('company_name', 'like', '%'.$request->company_name.'%');
        }

        if ($request->filled('product_type')) {
            $query->where('product_type', $request->product_type);
        }

        return response()->json($query->paginate(20));
    }

    // POST /api/pickup-logs
    public function store(Request $request)
    {
        $validated = $request->validate([
            'company_name' => 'required|string|max:255',
            'product_type' => 'required|in:bags,small_sack,big_sack',
            'quantity' => 'required|integer|min:1',
            'notes' => 'nullable|string',
            'pickup_date' => 'required|date',
        ]);

        $log = PickupLog::create([
            ...$validated,
            'recorded_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => 'Pickup logged successfully.',
            'log' => $log->load('recordedBy:id,name'),
        ], 201);
    }

    public function show(PickupLog $pickupLog)
    {
        return response()->json($pickupLog->load('recordedBy:id,name'));
    }

    public function update(Request $request, PickupLog $pickupLog)
    {
        $validated = $request->validate([
            'company_name' => 'sometimes|required|string|max:255',
            'product_type' => 'sometimes|required|in:bags,small_sack,big_sack',
            'quantity' => 'sometimes|required|integer|min:1',
            'notes' => 'nullable|string',
            'pickup_date' => 'sometimes|required|date',
        ]);

        $pickupLog->update($validated);

        return response()->json([
            'message' => 'Pickup log updated.',
            'log' => $pickupLog->fresh()->load('recordedBy:id,name'),
        ]);
    }

    public function destroy(PickupLog $pickupLog)
    {
        $pickupLog->delete();

        return response()->json(['message' => 'Pickup log deleted.']);
    }
}
