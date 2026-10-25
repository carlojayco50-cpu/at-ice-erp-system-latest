<?php

use App\Models\Customer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Only the three groups of the client's reference pricing remain (owner,
// 2026-10-20): Dealers, SM Malls and Alfamart (Customer::TYPES). Customers
// typed Restaurant / Food or Other are sorted again: a big restaurant chain
// gets the SM Malls prices, anyone else the Dealers prices
// (Customer::guessType). The reference prices of the two old types go.
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('customers')->whereIn('customer_type', ['restaurant', 'other'])->get(['id', 'name', 'chain']);
        foreach ($rows as $c) {
            DB::table('customers')->where('id', $c->id)->update([
                'customer_type' => Customer::guessType($c->chain, $c->name),
            ]);
        }

        DB::table('reference_prices')->whereIn('customer_type', ['restaurant', 'other'])->delete();
    }

    public function down(): void
    {
        // The sorting is kept.
    }
};
