<?php

namespace App\Models;

use App\Events\PaymentOverdue;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Receipt extends Model
{
    use HasFactory;

    protected $fillable = [
        'receipt_no',
        'delivery_id',
        'delivery_proof_id',
        'customer_id',
        'salesman_id',
        'quantity',
        'unit_price',
        'total_amount',
        'payment_status',
        'payment_method',
        'paid_at',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function deliveryProof()
    {
        return $this->belongsTo(DeliveryProof::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesman()
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    public function items()
    {
        return $this->hasMany(ReceiptItem::class);
    }

    // An unpaid receipt becomes overdue this many days after it was made.
    public const OVERDUE_DAYS = 15;

    // Marks unpaid receipts older than OVERDUE_DAYS as overdue. Every page that
    // shows receipts calls this first (there is no scheduler), so they all agree.
    // Each receipt is marked, and its notice sent, only once.
    public static function markOverdue(): void
    {
        $ids = self::where('payment_status', 'unpaid')
            ->where('created_at', '<=', now()->subDays(self::OVERDUE_DAYS))
            ->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        // Only the rows this call changed get a notice, even when two pages
        // open at the same moment.
        $marked = $ids->filter(fn ($id) => self::whereKey($id)->where('payment_status', 'unpaid')
            ->update(['payment_status' => 'overdue']) === 1);

        foreach (self::with('customer')->whereKey($marked->all())->get() as $receipt) {
            try {
                broadcast(new PaymentOverdue([
                    'receipt_id' => $receipt->id,
                    'receipt_no' => $receipt->receipt_no,
                    'customer' => $receipt->customer?->name ?? 'Unknown',
                    'total_amount' => $receipt->total_amount,
                    'message' => "Invoice {$receipt->receipt_no} is overdue!",
                ]));
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    // Invoice number: the customer's invoice code, the date and a number for
    // that customer that day, e.g. PG-20261013-001. Older invoices keep their
    // RCP-... numbers.
    public static function generateReceiptNo(?Customer $customer = null): string
    {
        $date = now()->format('Ymd');
        $code = $customer?->invoice_code ?: 'INV';
        $prefix = "{$code}-{$date}-";

        // One above the highest number used today (a count could repeat one).
        // Two receipts made at the same moment can still get the same number:
        // receipt_no is unique, and the caller retries (DeliveryProofController).
        $highest = self::where('receipt_no', 'like', $prefix.'%')->pluck('receipt_no')
            ->map(fn ($no) => (int) substr($no, strlen($prefix)))
            ->max() ?? 0;

        return $prefix.str_pad($highest + 1, 3, '0', STR_PAD_LEFT);
    }
}
