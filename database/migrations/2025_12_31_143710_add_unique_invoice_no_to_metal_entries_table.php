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
        Schema::table('metal_entries', function (Blueprint $table) {
            $table->unique('invoice_no');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('metal_entries', function (Blueprint $table) {
            $table->dropUnique(['invoice_no']);
        });
    }
};
