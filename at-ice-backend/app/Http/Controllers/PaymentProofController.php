<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\PaymentProof;
use App\Models\Receipt;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

// Proof of payment: the customer uploads a photo or PDF of their bank or GCash
// receipt for an unpaid or overdue invoice. It does not mark the invoice paid.
// Admin approves it (invoice paid, audited) or rejects it with a reason (the
// invoice stays unpaid and keeps counting toward overdue); the customer can
// then send another one. One pending proof per invoice at a time.
class PaymentProofController extends Controller
{
    private function myCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    // POST /api/my-receipts/{id}/payment-proofs (customer, multipart: file, method, reference_no)
    public function myStore(Request $request, $id)
    {
        $customer = $this->myCustomer($request);
        abort_unless($customer, 404, 'No customer account linked to this login.');

        $receipt = Receipt::where('customer_id', $customer->id)->findOrFail($id);

        $data = $request->validate([
            'file' => PaymentProof::FILE_RULE,
            'method' => ['nullable', Rule::in(array_keys(PaymentProof::METHODS))],
            'reference_no' => 'nullable|string|max:100',
        ], [
            'file.required' => 'Attach a photo or PDF of your payment receipt.',
            'file.mimes' => 'The proof must be a photo (JPG, PNG, WEBP) or a PDF.',
            'file.max' => 'The file is too big. The limit is 5 MB.',
        ]);

        if ($receipt->payment_status === 'paid') {
            return response()->json(['message' => 'This invoice is already paid.'], 422);
        }
        if ($receipt->paymentProofs()->where('status', 'pending')->exists()) {
            return response()->json(['message' => 'A payment proof for this invoice is already waiting for review.'], 422);
        }

        $file = $request->file('file');
        $proof = PaymentProof::create([
            'receipt_id' => $receipt->id,
            'customer_id' => $customer->id,
            'submitted_by' => $request->user()->id,
            // Kept private: only Admin and this customer can open it.
            'file_path' => $file->store('payment-proofs', 'local'),
            'file_disk' => 'local',
            'original_name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'method' => $data['method'] ?? null,
            'reference_no' => isset($data['reference_no']) ? trim($data['reference_no']) ?: null : null,
            'status' => 'pending',
        ]);

        return response()->json($proof, 201);
    }

    // GET /api/my-payment-proofs/{id}/file (customer, own)
    public function myFile(Request $request, $id)
    {
        $customer = $this->myCustomer($request);
        abort_unless($customer, 404);

        return $this->sendFile(PaymentProof::where('customer_id', $customer->id)->findOrFail($id));
    }

    // GET /api/payment-proofs?status=pending|approved|rejected (admin)
    public function index(Request $request)
    {
        $query = PaymentProof::with([
            'receipt:id,receipt_no,total_amount,payment_status,created_at,customer_id',
            'customer:id,name,customer_code',
            'reviewer:id,name',
        ])->latest('id');

        if (in_array($request->status, ['pending', 'approved', 'rejected'], true)) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'proofs' => $query->limit(200)->get(),
            'pending_count' => PaymentProof::where('status', 'pending')->count(),
        ]);
    }

    // GET /api/payment-proofs/{id}/file (admin)
    public function file($id)
    {
        return $this->sendFile(PaymentProof::findOrFail($id));
    }

    // PATCH /api/payment-proofs/{id}/approve (admin): the invoice becomes paid.
    public function approve(Request $request, $id)
    {
        return DB::transaction(function () use ($request, $id) {
            $proof = PaymentProof::lockForUpdate()->findOrFail($id);
            if ($proof->status !== 'pending') {
                return response()->json(['message' => 'This payment proof was already reviewed.'], 422);
            }
            $receipt = Receipt::lockForUpdate()->findOrFail($proof->receipt_id);
            if ($receipt->payment_status === 'paid') {
                return response()->json(['message' => 'This invoice is already paid.'], 422);
            }

            $before = $receipt->only(['payment_status', 'payment_method', 'paid_at']);
            $proof->update(['status' => 'approved', 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
            // receipts.payment_method takes cash, gcash, check or bank_transfer only.
            $receipt->update([
                'payment_status' => 'paid',
                'payment_method' => in_array($proof->method, ['cash', 'gcash', 'check', 'bank_transfer'], true) ? $proof->method : null,
                'paid_at' => now(),
            ]);

            Audit::log('invoice.paid_by_proof', $receipt, $before, $receipt->only(['payment_status', 'payment_method']) + [
                'paid_at' => $receipt->paid_at?->toDateTimeString(),
                'payment_proof_id' => $proof->id,
                'reference_no' => $proof->reference_no,
            ]);

            return response()->json($proof->fresh()->load('receipt:id,receipt_no,payment_status', 'reviewer:id,name'));
        });
    }

    // PATCH /api/payment-proofs/{id}/reject (admin, reason required): the invoice
    // stays unpaid or overdue; its overdue count is not reset.
    public function reject(Request $request, $id)
    {
        $data = $request->validate(['reason' => 'required|string|min:3|max:500'], [
            'reason.required' => 'Give the reason so the customer knows what to fix.',
        ]);

        return DB::transaction(function () use ($request, $id, $data) {
            $proof = PaymentProof::lockForUpdate()->findOrFail($id);
            if ($proof->status !== 'pending') {
                return response()->json(['message' => 'This payment proof was already reviewed.'], 422);
            }

            $proof->update([
                'status' => 'rejected',
                'reject_reason' => trim($data['reason']),
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);

            Audit::log('payment_proof.rejected', $proof, ['status' => 'pending'], ['status' => 'rejected', 'reason' => $proof->reject_reason, 'receipt_id' => $proof->receipt_id]);

            return response()->json($proof->fresh()->load('receipt:id,receipt_no,payment_status', 'reviewer:id,name'));
        });
    }

    private function sendFile(PaymentProof $proof)
    {
        $disk = Storage::disk($proof->file_disk ?: 'local');
        if (! $proof->file_path || ! $disk->exists($proof->file_path)) {
            return response()->json(['message' => 'The file of this payment proof is missing.'], 404);
        }

        return $disk->response($proof->file_path, $proof->original_name ?: basename($proof->file_path), [
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ], 'inline');
    }
}
