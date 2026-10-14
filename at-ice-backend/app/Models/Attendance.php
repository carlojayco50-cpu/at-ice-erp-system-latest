<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use HasFactory;

    protected $fillable = [
        'face_data_id',
        'employee_id',
        'recorded_by',
        'date',
        'time_in',
        'time_out',
        'hours_worked',
        'late_minutes',
        'ot_minutes',
        'ot_approved',
        'status',
        'notes',
    ];

    protected $casts = [
        'date' => 'date',
        'hours_worked' => 'decimal:2',
        'ot_approved' => 'boolean',
    ];

    // Relationship - Attendance belongs to FaceData
    public function faceData()
    {
        return $this->belongsTo(FaceData::class);
    }

    // Relationship - Attendance belongs to Employee
    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    // Relationship - Attendance recorded by User
    public function recordedBy()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
