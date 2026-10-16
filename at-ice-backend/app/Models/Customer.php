<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id', 'customer_code', 'name', 'customer_type', 'chain', 'branch_code', 'invoice_code', 'address',
        'block_lot', 'street', 'subdivision', 'barangay', 'postal_code', 'city',
        'province', 'region', 'barangay_code', 'latitude', 'longitude', 'contact_person', 'contact_number', 'email',
        'mop', 'is_active', 'notes',
    ];

    // Customer type (filter on Admin > Customers). The chain/group (SM,
    // Alfamart, Independent...) is free text.
    public const TYPES = [
        'supermarket' => 'Supermarket / Mall',
        'convenience_store' => 'Convenience Store',
        'restaurant' => 'Restaurant / Food',
        'dealer' => 'Dealer / Reseller',
        'other' => 'Other',
    ];

    // Invoice code: 2 to 5 capital letters that start each of the customer's
    // invoice numbers (PG-20261013-001), so an invoice shows at once whose it is.
    public const INVOICE_CODE_REGEX = '/^[A-Z]{2,5}$/';

    // Words that do not say which company it is.
    private const NAME_FILLER = ['the', 'and', 'of', 'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'store', 'stores', 'enterprise', 'enterprises', 'trading', 'branch'];

    // A free code made from the company name: the initials of a name of two or
    // more words ("Pure Gold Price Club" -> PGPC), otherwise its first letters
    // ("Alfamart" -> ALF). A taken code gets the next letter of the name, then a
    // letter from A to Z. $taken(code) says whether a code is in use.
    public static function invoiceCodeFor(string $name, ?callable $taken = null): string
    {
        $taken ??= fn ($c) => self::withTrashed()->where('invoice_code', $c)->exists();
        $words = array_values(array_filter(
            preg_split('/[^A-Za-z]+/', Str::ascii($name), -1, PREG_SPLIT_NO_EMPTY),
            fn ($w) => ! in_array(strtolower($w), self::NAME_FILLER, true)
        )) ?: ['Customer'];
        $letters = strtoupper(implode('', $words));
        $base = count($words) > 1
            ? strtoupper(substr(implode('', array_map(fn ($w) => $w[0], $words)), 0, 4))
            : substr($letters, 0, 3);
        if (strlen($base) < 2) {
            $base = str_pad(substr($letters, 0, 2), 2, 'X');
        }

        $tries = [$base];
        foreach (str_split(substr($letters, strlen($base))) as $l) {
            $tries[] = substr($base.$l, 0, 5);
        }
        foreach (range('A', 'Z') as $l) {
            $tries[] = substr($base, 0, 4).$l;
        }
        foreach (array_unique(array_filter($tries)) as $code) {
            if (strlen($code) >= 2 && ! $taken($code)) {
                return $code;
            }
        }

        return substr($base, 0, 3).strtoupper(Str::random(2));
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function customerPrices()
    {
        return $this->hasMany(CustomerPrice::class);
    }
}
