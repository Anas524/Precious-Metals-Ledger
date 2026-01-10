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
            $table->string('metal_type')->nullable()->change();
            $table->string('metal_shape')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('metal_entries', function (Blueprint $table) {
            $table->string('metal_type')->nullable(false)->change();
            $table->string('metal_shape')->nullable(false)->change();
        });
    }
};
