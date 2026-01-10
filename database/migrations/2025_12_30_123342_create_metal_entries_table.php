<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('metal_entries', function (Blueprint $table) {
            $table->id();

            $table->date('purchase_date');

            // only 3 types
            $table->enum('metal_type', ['gold', 'silver', 'platinum']);

            // dropdown values (you can extend anytime)
            $table->string('metal_shape'); // bar, coin, granules, packs, etc.

            $table->text('description')->nullable();

            $table->unsignedInteger('qty')->default(1);

            // weight in grams/kg? keep decimal flexible
            $table->decimal('weight', 12, 3)->nullable();

            $table->string('beneficiary_name')->nullable();

            $table->decimal('purchase_price', 14, 2)->nullable();
            $table->decimal('sell_price', 14, 2)->nullable();

            $table->date('sell_date')->nullable();

            // store multiple attachments paths (pdf/images)
            $table->json('attachments')->nullable();
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('metal_entries');
    }
};
