<?php

namespace App\Http\Controllers;

use App\Models\InventoryAlert;
use Illuminate\Http\Request;

class InventoryAlertController extends Controller
{
    public function index(Request $request)
    {
        $query = InventoryAlert::with('product')->orderBy('created_at', 'desc');

        if ($request->query('status') === 'resolved') {
            $query->where('is_resolved', true);
        } elseif ($request->query('status') !== 'all') {
            // default behavior: active/unresolved only
            $query->where('is_resolved', false);
        }

        $alerts = $query->get();

        return response()->json($alerts);
    }

    public function resolve($id)
    {
        $alert = InventoryAlert::findOrFail($id);
        $alert->update([
            'is_resolved' => true,
            'resolved_at' => now(),
        ]);

        return response()->json(['message' => 'Alert resolved.']);
    }
}
