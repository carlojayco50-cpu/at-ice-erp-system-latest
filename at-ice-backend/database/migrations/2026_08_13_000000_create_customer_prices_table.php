    <?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->onDelete('cascade');
            $table->enum('product_type', ['bags', 'small_sack', 'big_sack']);
            $table->decimal('unit_price', 8, 2);
            $table->timestamps();

            // Prevents duplicate price rows for the same customer + product
            $table->unique(['customer_id', 'product_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_prices');
    }
};
