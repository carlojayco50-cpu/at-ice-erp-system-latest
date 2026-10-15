<?php

use App\Models\Customer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Short code of the customer's company (e.g. PG) that starts each invoice
// number: PG-20261013-001 (App\Models\Receipt::generateReceiptNo).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('invoice_code', 5)->nullable()->unique()->after('branch_code');
        });

        // Existing customers get one from their name.
        $taken = [];
        foreach (DB::table('customers')->orderBy('id')->get(['id', 'name']) as $row) {
            $code = Customer::invoiceCodeFor((string) $row->name, fn ($c) => in_array($c, $taken, true));
            $taken[] = $code;
            DB::table('customers')->where('id', $row->id)->update(['invoice_code' => $code]);
        }
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique(['invoice_code']);
            $table->dropColumn('invoice_code');
        });
    }
};
