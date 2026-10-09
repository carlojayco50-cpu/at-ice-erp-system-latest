<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function index()
    {
        return response()->json(
            Order::with(['customer', 'items.product', 'preparedBy'])->latest()->get()
        );
    }

    public function store(Request $request)
    {
        $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'order_date' => 'required|date',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        DB::beginTransaction();
        try {
            $orderNo = 'ORD-'.strtoupper(uniqid());
            $totalAmount = 0;
            $itemsData = [];

            foreach ($request->items as $item) {
                $product = Product::findOrFail($item['product_id']);
                $subtotal = $product->unit_price * $item['quantity'];
                $totalAmount += $subtotal;

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $product->unit_price,
                    'subtotal' => $subtotal,
                    'notes' => $item['notes'] ?? null,
                ];
            }

            $order = Order::create([
                'order_no' => $orderNo,
                'customer_id' => $request->customer_id,
                'prepared_by' => $request->user()->id,
                'status' => 'pending',
                'order_date' => $request->order_date,
                'delivery_date' => $request->delivery_date ?? null,
                'total_amount' => $totalAmount,
                'amount_paid' => 0,
                'balance' => $totalAmount,
                'payment_status' => 'unpaid',
                'notes' => $request->notes ?? null,
            ]);

            foreach ($itemsData as $item) {
                $item['order_id'] = $order->id;
                OrderItem::create($item);
            }

            DB::commit();

            return response()->json($order->load(['customer', 'items.product']), 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['message' => 'Order creation failed.', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        return response()->json(
            Order::with(['customer', 'items.product', 'payments', 'preparedBy'])->findOrFail($id)
        );
    }

    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:pending,confirmed,dispatched,delivered,cancelled',
        ]);
        $order = Order::findOrFail($id);
        $order->update(['status' => $request->status]);

        return response()->json($order);
    }

    public function cancel($id)
    {
        $order = Order::findOrFail($id);
        $order->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Order cancelled.']);
    }

    // Customer — view own orders. customer_id on Order refers to the
    // customers table, NOT the logged-in user's id — those are two
    // different ids since a Customer Portal login is a User linked to a
    // Customer via customers.user_id (added this session for the Admin
    // "Create Login" feature).
    public function myOrders(Request $request)
    {
        $customer = \App\Models\Customer::where('user_id', $request->user()->id)->first();

        if (! $customer) {
            return response()->json([]);
        }

        $orders = Order::with(['items.product', 'payments'])
            ->where('customer_id', $customer->id)
            ->latest()
            ->get();

        return response()->json($orders);
    }
}
