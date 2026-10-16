<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Customer type (Supermarket/Mall, Convenience Store, ...) and chain or group
// (SM, Alfamart, Independent, ...), both filters on Admin > Customers.
// Existing customers whose name starts with a known chain are filled in.
return new class extends Migration
{
    // Name starts with => [chain, type]
    private const KNOWN = [
        'alfamart' => ['Alfamart', 'convenience_store'],
        '7-eleven' => ['7-Eleven', 'convenience_store'],
        '7 eleven' => ['7-Eleven', 'convenience_store'],
        'ministop' => ['Ministop', 'convenience_store'],
        'lawson' => ['Lawson', 'convenience_store'],
        'familymart' => ['FamilyMart', 'convenience_store'],
        'family mart' => ['FamilyMart', 'convenience_store'],
        'uncle john' => ["Uncle John's", 'convenience_store'],
        'dali ' => ['Dali', 'convenience_store'],
        'puregold' => ['Puregold', 'supermarket'],
        'pure gold' => ['Puregold', 'supermarket'],
        'waltermart' => ['WalterMart', 'supermarket'],
        'walter mart' => ['WalterMart', 'supermarket'],
        'savemore' => ['SM', 'supermarket'],
        'sm ' => ['SM', 'supermarket'],
        'robinsons' => ['Robinsons', 'supermarket'],
        'shopwise' => ['Robinsons', 'supermarket'],
        'landmark' => ['Landmark', 'supermarket'],
        'metro ' => ['Metro', 'supermarket'],
        'jollibee' => ['Jollibee', 'restaurant'],
        'mcdonald' => ["McDonald's", 'restaurant'],
        'chowking' => ['Chowking', 'restaurant'],
        'mang inasal' => ['Mang Inasal', 'restaurant'],
        'zarks burger' => ['Zarks Burger', 'restaurant'],
        'chooks to go' => ['Chooks to Go', 'restaurant'],
        'cabalen' => ['Cabalen', 'restaurant'],
        'shakeys' => ["Shakey's", 'restaurant'],
        "shakey's" => ["Shakey's", 'restaurant'],
        'bonchon' => ['Bonchon', 'restaurant'],
        'dunkin' => ['Dunkin', 'restaurant'],
        "max's" => ["Max's", 'restaurant'],
        'fruitas' => ['Fruitas', 'restaurant'],
        'zagu' => ['Zagu', 'restaurant'],
        'siomai house' => ['Siomai House', 'restaurant'],
        'goto ni juan' => ['Goto ni Juan', 'restaurant'],
        'kyu kyu ramen' => ['Kyu Kyu Ramen', 'restaurant'],
        'hongkong noodles' => ['Hongkong Noodles', 'restaurant'],
        'paotsin' => ['Paotsin', 'restaurant'],
        'rice n box' => ['Rice N Box', 'restaurant'],
        'giligans' => ["Giligan's", 'restaurant'],
        'buko juan' => ['Buko Juan', 'restaurant'],
        'infinitea' => ['Infinitea', 'restaurant'],
        'jessie cane' => ['Jessie Cane', 'restaurant'],
        'coco shake' => ['Coco Shake', 'restaurant'],
        'samgyeop masarap' => ['Samgyeop Masarap', 'restaurant'],
    ];

    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('customer_type', 30)->nullable()->after('name');
            $table->string('chain', 100)->nullable()->after('customer_type');
            $table->index('customer_type');
            $table->index('chain');
        });

        foreach (DB::table('customers')->select('id', 'name')->get() as $c) {
            $name = mb_strtolower(trim((string) $c->name)).' ';
            foreach (self::KNOWN as $start => [$chain, $type]) {
                if (str_starts_with($name, $start)) {
                    DB::table('customers')->where('id', $c->id)->update(['chain' => $chain, 'customer_type' => $type]);
                    break;
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['customer_type']);
            $table->dropIndex(['chain']);
            $table->dropColumn(['customer_type', 'chain']);
        });
    }
};
