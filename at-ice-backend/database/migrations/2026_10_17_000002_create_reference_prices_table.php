<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Reference prices per customer type (owner, 2026-10-17): a customer with no
// price of its own for a product pays its type's reference price
// (App\Models\CustomerPrice::priceFor). Admin edits both on CRM > Customer
// Prices. Seeded with the client-confirmed table (v25.7): Dealers, SM Malls
// (supermarkets), Alfamart (convenience stores). Restaurants and Other have
// no reference price from the client yet.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reference_prices', function (Blueprint $table) {
            $table->id();
            $table->string('customer_type', 30);
            $table->string('product_type', 20);
            $table->decimal('unit_price', 10, 2)->nullable();
            $table->timestamps();
            $table->unique(['customer_type', 'product_type']);
        });

        $table = [
            'dealer' => ['bags' => 45, 'small_sack' => 65, 'big_sack' => 108],
            'supermarket' => ['bags' => 25, 'small_sack' => 150, 'big_sack' => 250],
            'convenience_store' => ['bags' => 24, 'small_sack' => null, 'big_sack' => null],
            'restaurant' => ['bags' => null, 'small_sack' => null, 'big_sack' => null],
            'other' => ['bags' => null, 'small_sack' => null, 'big_sack' => null],
        ];
        foreach ($table as $type => $prices) {
            foreach ($prices as $product => $price) {
                DB::table('reference_prices')->insert([
                    'customer_type' => $type, 'product_type' => $product, 'unit_price' => $price,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reference_prices');
    }
};
