<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\SupportMessage;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Contact Support: customers send messages, the Admin (dispatch room) reads
// and resolves them. There is no other recipient.
class SupportMessageController extends Controller
{
    private function myCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    // GET /api/my-support-messages (customer): own messages, newest first
    public function myIndex(Request $request)
    {
        $customer = $this->myCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        return response()->json(
            SupportMessage::where('customer_id', $customer->id)->latest()->limit(20)->get()
        );
    }

    // POST /api/my-support-messages (customer)
    public function myStore(Request $request)
    {
        $customer = $this->myCustomer($request);
        if (! $customer) {
            return response()->json(['message' => 'No customer account linked to this login.'], 404);
        }

        $data = $request->validate([
            'topic' => ['required', Rule::in(array_keys(SupportMessage::TOPICS))],
            'message' => 'required|string|min:5|max:2000',
        ]);

        $message = SupportMessage::create([
            'customer_id' => $customer->id,
            'user_id' => $request->user()->id,
            'topic' => $data['topic'],
            'message' => trim($data['message']),
            'status' => 'open',
        ]);

        return response()->json($message, 201);
    }

    // GET /api/support-messages?status=open|resolved (admin)
    public function index(Request $request)
    {
        $query = SupportMessage::with(['customer:id,name,customer_code,contact_person,contact_number,email', 'resolver:id,name'])
            ->latest();

        if (in_array($request->status, ['open', 'resolved'], true)) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'messages' => $query->limit(200)->get(),
            'open_count' => SupportMessage::where('status', 'open')->count(),
        ]);
    }

    // PATCH /api/support-messages/{supportMessage}/resolve (admin)
    public function resolve(Request $request, SupportMessage $supportMessage)
    {
        $supportMessage->update([
            'status' => 'resolved',
            'resolved_by' => $request->user()->id,
            'resolved_at' => now(),
        ]);

        return response()->json($supportMessage->load('customer:id,name', 'resolver:id,name'));
    }

    // PATCH /api/support-messages/{supportMessage}/reopen (admin)
    public function reopen(SupportMessage $supportMessage)
    {
        $supportMessage->update(['status' => 'open', 'resolved_by' => null, 'resolved_at' => null]);

        return response()->json($supportMessage->load('customer:id,name'));
    }
}
