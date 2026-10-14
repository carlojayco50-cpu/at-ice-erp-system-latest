<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockOutRequest extends Model
{
    protected $fillable = [
        'requested_by',
        'product_id',
        'project_id',
        'item_name',
        'quantity',
        'purpose',
        'status',
        'approved_by',
        'approved_at',
        'rejection_reason',
        'released_by',
        'released_at',
        'stock_movement_id',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function releasedBy()
    {
        return $this->belongsTo(User::class, 'released_by');
    }

    // The inventory item requested. Null on older free-text requests.
    public function product()
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    // The project on Admin's board this request is for (optional).
    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    // The confirmed Stock Out made when the Admin released it.
    public function stockMovement()
    {
        return $this->belongsTo(StockMovement::class);
    }
}
