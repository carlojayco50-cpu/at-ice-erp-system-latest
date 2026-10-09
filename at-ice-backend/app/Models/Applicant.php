<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Applicant extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'position_applied',
        'interview_date',
        'status',
        'notes',
    ];

    protected $casts = [
        'interview_date' => 'datetime:Y-m-d H:i:s',
    ];
}
