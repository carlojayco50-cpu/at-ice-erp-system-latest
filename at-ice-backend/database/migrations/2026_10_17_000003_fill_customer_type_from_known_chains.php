<?php

use App\Models\Customer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Customers with no type or chain yet get them from the known chain list
// (Customer::KNOWN_CHAINS), matched on the chain or the start of the name;
// a food word in the name (Customer::FOOD_WORDS) makes it Restaurant / Food.
// Nothing already filled in is changed.
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('customers')
            ->where(fn ($q) => $q->whereNull('customer_type')->orWhereNull('chain'))
            ->get(['id', 'name', 'chain', 'customer_type']);

        foreach ($rows as $c) {
            $known = Customer::knownChain($c->chain, $c->name);
            $patch = [];
            if (! $c->chain && $known) {
                $patch['chain'] = $known;
            }
            // a food word in the name ("Mi Ma Grill") makes it Restaurant / Food
            if (! $c->customer_type && ($type = Customer::guessType($c->chain, $c->name))) {
                $patch['customer_type'] = $type;
            }
            if ($patch) {
                DB::table('customers')->where('id', $c->id)->update($patch);
            }
        }
    }

    public function down(): void
    {
        // Filled-in values are kept.
    }
};
