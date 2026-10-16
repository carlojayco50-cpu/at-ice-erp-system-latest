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

    // Customer type (filter on Admin > Customers; picks the reference prices,
    // App\Models\ReferencePrice). The chain/group (SM, Alfamart,
    // Independent...) is free text. Same list as src/lib/customerTypes.js.
    public const TYPES = [
        'supermarket' => 'Supermarket / Mall',
        'convenience_store' => 'Convenience Store',
        'restaurant' => 'Restaurant / Food',
        'dealer' => 'Dealer / Reseller',
        'other' => 'Other',
    ];

    // Known chains and their type, used to fill in a blank chain and type
    // from the chain or from the start of the customer's name.
    public const KNOWN_CHAINS = [
        // Supermarket / Mall
        'SM' => 'supermarket', 'Savemore' => 'supermarket', 'Puregold' => 'supermarket', 'Robinsons' => 'supermarket',
        'Shopwise' => 'supermarket', 'WalterMart' => 'supermarket', 'Landmark' => 'supermarket', 'Metro' => 'supermarket',
        'Gaisano' => 'supermarket', 'S&R' => 'supermarket', 'Ever' => 'supermarket', 'Super8' => 'supermarket',
        'AllDay' => 'supermarket', "Rustan's" => 'supermarket', 'Unimart' => 'supermarket',
        // Convenience Store
        '7-Eleven' => 'convenience_store', 'Alfamart' => 'convenience_store', 'Ministop' => 'convenience_store',
        'Lawson' => 'convenience_store', 'FamilyMart' => 'convenience_store', "Uncle John's" => 'convenience_store',
        'Dali' => 'convenience_store', 'Puregold Jr.' => 'convenience_store',
        // Restaurant / Food
        'Jollibee' => 'restaurant', "McDonald's" => 'restaurant', 'Chowking' => 'restaurant', 'Mang Inasal' => 'restaurant',
        'Greenwich' => 'restaurant', 'Red Ribbon' => 'restaurant', 'KFC' => 'restaurant', "Max's" => 'restaurant',
        "Shakey's" => 'restaurant', 'Bonchon' => 'restaurant', 'Army Navy' => 'restaurant', 'Potato Corner' => 'restaurant',
        'Zagu' => 'restaurant', 'Fruitas' => 'restaurant', 'Dunkin' => 'restaurant', 'Goto ni Juan' => 'restaurant',
        'Siomai House' => 'restaurant', 'Zarks Burger' => 'restaurant', 'Chooks to Go' => 'restaurant', 'Cabalen' => 'restaurant',
        "Giligan's" => 'restaurant', 'Kyu Kyu Ramen' => 'restaurant', 'Hongkong Noodles' => 'restaurant', 'Paotsin' => 'restaurant',
        'Rice N Box' => 'restaurant', 'Buko Juan' => 'restaurant', 'Infinitea' => 'restaurant', 'Jessie Cane' => 'restaurant',
        'Coco Shake' => 'restaurant', 'Samgyeop Masarap' => 'restaurant', 'Gong Cha' => 'restaurant', 'Chatime' => 'restaurant',
        'Starbucks' => 'restaurant', 'Yellow Cab' => 'restaurant', 'Pizza Hut' => 'restaurant', "Angel's Burger" => 'restaurant',
        'Savory' => 'restaurant',
    ];

    // Words in a name that say it is a food business (when no chain matches).
    public const FOOD_WORDS = '/\b(food|foods|kitchen|grill|grille|chicken|tea|coffee|cafe|caf\x{e9}|bakery|bakeshop|waffles?|lemon|lemonade|float|buko|juice|shake|bibingka|lechon|bbq|barbecue|pizza|burger|ramen|noodles?|siomai|eatery|carinderia|restaurant|resto|bistro|kainan|milk ?tea|halo-?halo|avocado\w*)\b/iu';

    // The type a customer most likely is: its known chain's type, else
    // Restaurant / Food for a food word in the name, else null.
    public static function guessType(?string $chain, ?string $name): ?string
    {
        if ($known = self::knownChain($chain, $name)) {
            return self::KNOWN_CHAINS[$known];
        }

        return preg_match(self::FOOD_WORDS, (string) $name) ? 'restaurant' : null;
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
