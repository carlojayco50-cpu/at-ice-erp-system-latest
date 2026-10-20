<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A file attached to an employee's biodata (resume, 2x2 photo, NBI clearance,
// government ID, diploma...), kept on the private disk; HR opens it through
// EmployeeDocumentController.
class EmployeeDocument extends Model
{
    protected $fillable = ['employee_id', 'type', 'path', 'original_name', 'mime', 'size', 'uploaded_by'];

    protected $hidden = ['path'];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
