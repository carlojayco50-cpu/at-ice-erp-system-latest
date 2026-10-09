<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'employee_id',
        'first_name',
        'middle_initial',
        'last_name',
        'suffix',
        'phone',
        'address',
        'block_lot',
        'street',
        'subdivision',
        'barangay',
        'city',
        'province',
        'postal_code',
        'position',
        'department',
        'daily_rate',
        'date_hired',
        'employment_type',
        'shift',
        'vehicle_plate',
        'is_active',
    ];

    protected $casts = [
        'date_hired' => 'date',
        'is_active' => 'boolean',
        'daily_rate' => 'decimal:2',
    ];

    // Relationship - Employee belongs to User
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    // Relationship - Employee has one enrolled face (Attendance Station)
    public function faceData()
    {
        return $this->hasOne(FaceData::class);
    }

    // Relationship - Employee has many Attendances
    public function attendances()
    {
        return $this->hasMany(Attendance::class);
    }

    // Relationship - Employee has many Leave Requests
    public function leaveRequests()
    {
        return $this->hasMany(LeaveRequest::class);
    }

    // Relationship - Employee has many Payrolls
    public function payrolls()
    {
        return $this->hasMany(Payroll::class);
    }

    // Name suffixes HR can pick.
    public const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

    // Sent with every employee in API responses.
    protected $appends = ['full_name'];

    // "Juan D. Dela Cruz Jr." (middle initial and suffix only when set)
    public static function composeName(?string $first, ?string $middleInitial, ?string $last, ?string $suffix): string
    {
        $mi = $middleInitial ? strtoupper($middleInitial).'.' : null;

        return trim(implode(' ', array_filter([$first, $mi, $last, $suffix], fn ($p) => $p !== null && $p !== '')));
    }

    // Full name accessor
    public function getFullNameAttribute()
    {
        return self::composeName($this->first_name, $this->middle_initial, $this->last_name, $this->suffix);
    }
}
