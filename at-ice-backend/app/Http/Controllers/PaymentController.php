<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $payments = Payment::with(['order', 'customer', 'receivedBy'])
            ->when($request->order_id, fn ($q) => $q->where('order_id', $request->order_id))
            ->latest()
            ->get();

        return response()->json($payments);
    }

    public function store(Request $request)
    {
        $request->validate([
            'order_id' => 'required|exists:orders,id',
            'amount' => 'required|numeric|min:0.01',
            'mop' => 'required|in:cash,gcash,check,bank_transfer',
            'payment_date' => 'required|date',
        ]);

        $order = Order::findOrFail($request->order_id);

        $payment = Payment::create([
            'payment_no' => 'PAY-'.strtoupper(uniqid()),
            'order_id' => $request->order_id,
            'customer_id' => $order->customer_id,
            'received_by' => $request->user()->id,
            'amount' => $request->amount,
            'mop' => $request->mop,
            'reference_no' => $request->reference_no ?? null,
            'payment_date' => $request->payment_date,
            'notes' => $request->notes ?? null,
        ]);

        $order->amount_paid += $request->amount;
        $order->updatePaymentStatus();

        return response()->json($payment, 201);
    }

    // Customer - view own payments. Same customer_id vs user_id fix as
    // OrderController@myOrders() — see note there.
    public function myPayments(Request $request)
    {
        $customer = \App\Models\Customer::where('user_id', $request->user()->id)->first();

        if (! $customer) {
            return response()->json([]);
        }

        $payments = Payment::with(['order'])
            ->where('customer_id', $customer->id)
            ->latest()
            ->get();

        return response()->json($payments);
    }
}
