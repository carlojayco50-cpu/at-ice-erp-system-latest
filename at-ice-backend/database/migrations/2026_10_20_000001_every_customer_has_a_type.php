<?php

use App\Models\Customer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// There is no chain field any more (owner, 2026-10-20): prices come from the
// customer type's reference prices, so every customer gets a type. A customer
// with none gets its known chain's type, else Dealers (Customer::guessType).
// Types already set are kept.
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('customers')->whereNull('customer_type')->get(['id', 'name', 'chain']);

        foreach ($rows as $c) {
            DB::table('customers')->where('id', $c->id)->update([
                'customer_type' => Customer::guessType($c->chain, $c->name),
            ]);
        }
    }

    public function down(): void
    {
        // Filled-in types are kept.
    }
};
