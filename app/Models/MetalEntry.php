<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MetalEntry extends Model
{
    protected $fillable = [
        'purchase_date',
        'metal_type',
        'metal_shape',
        'description',
        'qty',
        'weight',
        'beneficiary_name',
        'purchase_price',
        'sell_price',
        'sell_date',
        'supplier_name',
        'brand_name',
        'certificate_no',
        'mode_of_transaction',
        'receipt_no',
        'remarks',
        'attachments',
        'invoice_no',
        'items',
    ];

    protected $casts = [
        'items' => 'array',
        'attachments' => 'array',
        'purchase_date' => 'date',
        'sell_date' => 'date',
    ];
}
