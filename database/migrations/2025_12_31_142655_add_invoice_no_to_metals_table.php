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
        if (!Schema::hasColumn('metal_entries', 'invoice_no')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->string('invoice_no')->nullable()->after('id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('metal_entries', 'invoice_no')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->dropColumn('invoice_no');
            });
        }
    }
};
