<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaceData extends Model
{
    use HasFactory;

    protected $table = 'face_data';

    protected $fillable = [
        'worker_name',
        'role',
        'employee_id',
        'descriptor',
        'photo_path',
    ];

    protected $casts = [
        'descriptor' => 'array',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
