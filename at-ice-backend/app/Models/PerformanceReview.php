<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Admin's changes to an employee's appraisal for a pay period (final rating,
// goal, remarks, published). The draft rating itself is App\Support\PerformanceScore.
class PerformanceReview extends Model
{
    protected $fillable = [
        'employee_id', 'period_start', 'period_end', 'final_rating', 'goal_target', 'remarks',
        'status', 'updated_by', 'published_by', 'published_at',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'final_rating' => 'float',
        'goal_target' => 'integer',
        'published_at' => 'datetime',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function publisher()
    {
        return $this->belongsTo(User::class, 'published_by');
    }
}
