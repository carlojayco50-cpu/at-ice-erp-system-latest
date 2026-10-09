<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'product_code', 'name', 'category', 'unit',
        'unit_price', 'current_stock', 'minimum_stock',
        'maximum_stock', 'description', 'is_active',
    ];

    protected $casts = ['is_active' => 'boolean'];

    public function stockMovements()
    {
        return $this->hasMany(StockMovement::class);
    }

    public function alerts()
    {
        return $this->hasMany(InventoryAlert::class);
    }

    public function isLowStock(): bool
    {
        return $this->current_stock <= $this->minimum_stock;
    }
}
