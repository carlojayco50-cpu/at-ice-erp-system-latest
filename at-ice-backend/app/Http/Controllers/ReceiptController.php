<?php

namespace App\Http\Controllers;

use App\Events\PaymentOverdue;
use App\Models\Receipt;
use Illuminate\Http\Request;

class ReceiptController extends Controller
{
    public function index(Request $request)
    {
        // 'items' is loaded so the View modal can list each product line
        // (product_type, quantity, unit_price, line_total).
        $query = Receipt::with([
            'delivery',
            'customer',
            'salesman',
            'deliveryProof',
            'items',
        ]);

        if ($request->has('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }

        if ($request->has('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }
        if ($request->has('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        $receipts = $query->latest()->get();

        return response()->json($receipts);
    }

    public function show($id)
    {
        $receipt = Receipt::with([
            'delivery',
            'customer',
            'salesman',
            'deliveryProof',
            'items',
        ])->findOrFail($id);

        return response()->json($receipt);
    }

    public function markAsPaid(Request $request, $id)
    {
        $request->validate([
            'payment_method' => 'required|in:cash,gcash,check,bank_transfer',
        ]);

        $receipt = Receipt::findOrFail($id);

        if ($receipt->payment_status === 'paid') {
            return response()->json(['message' => 'Receipt already marked as paid.'], 422);
        }

        $receipt->update([
            'payment_status' => 'paid',
            'payment_method' => $request->payment_method,
            'paid_at' => now(),
        ]);

        return response()->json([
            'message' => 'Receipt marked as paid successfully!',
            'receipt' => $receipt,
        ]);
    }

    public function overdue()
    {
        // Auto-mark as overdue FIRST
        Receipt::where('payment_status', 'unpaid')
            ->where('created_at', '<=', now()->subDays(15))
            ->update(['payment_status' => 'overdue']);

        // THEN fetch updated records
        $receipts = Receipt::with(['customer', 'delivery'])
            ->where('payment_status', 'overdue')
            ->latest()
            ->get();

        // Fire PaymentOverdue event for each overdue receipt
        foreach ($receipts as $receipt) {
            broadcast(new PaymentOverdue([
                'receipt_id' => $receipt->id,
                'receipt_no' => $receipt->receipt_no,
                'customer' => $receipt->customer?->name ?? 'Unknown',
                'total_amount' => $receipt->total_amount,
                'message' => "Receipt {$receipt->receipt_no} is overdue!",
            ]))->toOthers();
        }

        return response()->json($receipts);
    }

    public function summary()
    {
        $totalSales = Receipt::where('payment_status', 'paid')->sum('total_amount');
        $totalUnpaid = Receipt::where('payment_status', 'unpaid')->sum('total_amount');
        $totalOverdue = Receipt::where('payment_status', 'overdue')->sum('total_amount');
        $receiptCount = Receipt::count();

        return response()->json([
            'total_sales' => $totalSales,
            'total_unpaid' => $totalUnpaid,
            'total_overdue' => $totalOverdue,
            'receipt_count' => $receiptCount,
        ]);
    }
}
