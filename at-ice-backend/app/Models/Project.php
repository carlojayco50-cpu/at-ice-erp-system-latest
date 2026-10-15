<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A project on Admin's board (Admin > Projects): a maintenance or plant job
// that uses inventory supplies through Maintenance stock-out requests.
class Project extends Model
{
    public const STATUSES = ['planned', 'working', 'stuck', 'done'];

    public const PRIORITIES = ['low', 'medium', 'high', 'critical'];

    protected $fillable = [
        'name', 'description', 'location', 'latitude', 'longitude', 'geofence_radius_m', 'status', 'priority', 'owner',
        'start_date', 'due_date', 'budget', 'created_by',
    ];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'due_date' => 'date:Y-m-d',
        'budget' => 'decimal:2',
    ];

    public function stockOutRequests()
    {
        return $this->hasMany(StockOutRequest::class);
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
