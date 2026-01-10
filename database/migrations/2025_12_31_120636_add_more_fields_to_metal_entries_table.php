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
        if (!Schema::hasColumn('metal_entries', 'supplier_name')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->string('supplier_name')->nullable()->after('beneficiary_name');
            });
        }

        if (!Schema::hasColumn('metal_entries', 'brand_name')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->string('brand_name')->nullable();
            });
        }

        if (!Schema::hasColumn('metal_entries', 'certificate_no')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->string('certificate_no')->nullable();
            });
        }

        if (!Schema::hasColumn('metal_entries', 'mode_of_transaction')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->string('mode_of_transaction')->nullable();
            });
        }

        if (!Schema::hasColumn('metal_entries', 'receipt_no')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->string('receipt_no')->nullable();
            });
        }

        if (!Schema::hasColumn('metal_entries', 'remarks')) {
            Schema::table('metal_entries', function (Blueprint $table) {
                $table->text('remarks')->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('metal_entries', function (Blueprint $table) {
            //
        });
    }
};
