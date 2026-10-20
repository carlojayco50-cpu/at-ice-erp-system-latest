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

    // Customer type: the three groups of the client's reference pricing
    // (owner, 2026-10-20); it picks the reference prices
    // (App\Models\ReferencePrice). Supermarkets, malls and big restaurant
    // chains pay the SM Malls prices, convenience stores the Alfamart prices,
    // and dealers, resellers and every independent store the Dealers prices.
    // The chain is worked out from the name. Same list as src/lib/customerTypes.js.
    public const TYPES = [
        'dealer' => 'Dealers',
        'supermarket' => 'SM Malls',
        'convenience_store' => 'Alfamart',
    ];

    // Known chains and their type, used to fill in a blank chain and type
    // from the chain or from the start of the customer's name.
    public const KNOWN_CHAINS = [
        // Supermarkets and malls: SM Malls prices
        'SM' => 'supermarket', 'Savemore' => 'supermarket', 'Puregold' => 'supermarket', 'Robinsons' => 'supermarket',
        'Shopwise' => 'supermarket', 'WalterMart' => 'supermarket', 'Landmark' => 'supermarket', 'Metro' => 'supermarket',
        'Gaisano' => 'supermarket', 'S&R' => 'supermarket', 'Ever' => 'supermarket', 'Super8' => 'supermarket',
        'AllDay' => 'supermarket', "Rustan's" => 'supermarket', 'Unimart' => 'supermarket',
        // Convenience stores: Alfamart prices
        '7-Eleven' => 'convenience_store', 'Alfamart' => 'convenience_store', 'Ministop' => 'convenience_store',
        'Lawson' => 'convenience_store', 'FamilyMart' => 'convenience_store', "Uncle John's" => 'convenience_store',
        'Dali' => 'convenience_store', 'Puregold Jr.' => 'convenience_store',
        // Big restaurant chains (corporate accounts): SM Malls prices
        'Jollibee' => 'supermarket', "McDonald's" => 'supermarket', 'Chowking' => 'supermarket', 'Mang Inasal' => 'supermarket',
        'Greenwich' => 'supermarket', 'Red Ribbon' => 'supermarket', 'KFC' => 'supermarket', "Max's" => 'supermarket',
        "Shakey's" => 'supermarket', 'Bonchon' => 'supermarket', 'Army Navy' => 'supermarket', 'Potato Corner' => 'supermarket',
        'Zagu' => 'supermarket', 'Fruitas' => 'supermarket', 'Dunkin' => 'supermarket', 'Goto ni Juan' => 'supermarket',
        'Siomai House' => 'supermarket', 'Zarks Burger' => 'supermarket', 'Chooks to Go' => 'supermarket', 'Cabalen' => 'supermarket',
        "Giligan's" => 'supermarket', 'Kyu Kyu Ramen' => 'supermarket', 'Hongkong Noodles' => 'supermarket', 'Paotsin' => 'supermarket',
        'Rice N Box' => 'supermarket', 'Buko Juan' => 'supermarket', 'Infinitea' => 'supermarket', 'Jessie Cane' => 'supermarket',
        'Coco Shake' => 'supermarket', 'Samgyeop Masarap' => 'supermarket', 'Gong Cha' => 'supermarket', 'Chatime' => 'supermarket',
        'Starbucks' => 'supermarket', 'Yellow Cab' => 'supermarket', 'Pizza Hut' => 'supermarket', "Angel's Burger" => 'supermarket',
        'Savory' => 'supermarket',
    ];

    // The type a customer most likely is: its known chain's type, else
    // Dealers (an independent store).
    public static function guessType(?string $chain, ?string $name): string
    {
        if ($known = self::knownChain($chain, $name)) {
            return self::KNOWN_CHAINS[$known];
        }

        return 'dealer';
    }

    private static function normChain(?string $v): string
    {
        return trim(preg_replace('/[^a-z0-9&]+/', ' ', mb_strtolower((string) $v)));
    }

    // The known chain this chain is, or that the name starts with (the
    // longest match: "Puregold Jr. Muzon" is Puregold Jr.), or null.
    public static function knownChain(?string $chain, ?string $name = null): ?string
    {
        foreach (array_keys(self::KNOWN_CHAINS) as $k) {
            if ($chain && self::normChain($k) === self::normChain($chain)) {
                return $k;
            }
        }
        $n = ' '.self::normChain($name).' ';
        $best = null;
        foreach (array_keys(self::KNOWN_CHAINS) as $k) {
            if (str_starts_with($n, ' '.self::normChain($k).' ') && strlen($k) > strlen((string) $best)) {
                $best = $k;
            }
        }

        return $best;
    }

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
