<?php

namespace App\Http\Controllers;

use App\Models\Receipt;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReceiptController extends Controller
{
    public function index(Request $request)
    {
        Receipt::markOverdue();

        // 'items' is loaded so the View modal can list each product line
        // (product_type, quantity, unit_price, line_total), and the customer's
        // payment proofs (newest first) so it shows what they attached.
        $query = Receipt::with([
            'delivery',
            'customer',
            'salesman',
            'deliveryProof',
            'items',
            'paymentProofs.reviewer:id,name',
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

        return DB::transaction(function () use ($request, $id) {
            $receipt = Receipt::lockForUpdate()->findOrFail($id);

            if ($receipt->payment_status === 'paid') {
                return response()->json(['message' => 'This invoice is already paid.'], 422);
            }
            // A customer's proof waiting for review is decided there (approve or
            // reject), so the invoice and its proof never disagree.
            if ($receipt->paymentProofs()->where('status', 'pending')->exists()) {
                return response()->json(['message' => 'The customer sent a payment proof for this invoice. Approve or reject it under Payment proofs to review first.'], 422);
            }

            $before = $receipt->only(['payment_status', 'payment_method', 'paid_at']);
            $receipt->update([
                'payment_status' => 'paid',
                'payment_method' => $request->payment_method,
                'paid_at' => now(),
            ]);

            Audit::log('invoice.marked_paid', $receipt, $before, $receipt->only(['payment_status', 'payment_method']) + [
                'paid_at' => $receipt->paid_at?->toDateTimeString(),
            ]);

            return response()->json([
                'message' => 'Invoice marked as paid.',
                'receipt' => $receipt,
            ]);
        });
    }

    public function overdue()
    {
        Receipt::markOverdue();

        return response()->json(
            Receipt::with(['customer', 'delivery'])
                ->where('payment_status', 'overdue')
                ->latest()
                ->get()
        );
    }

    public function summary()
    {
        Receipt::markOverdue();

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
