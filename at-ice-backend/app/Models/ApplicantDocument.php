<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A file an applicant attached on /apply (2x2 photo, ID, certificates...), on
// the private disk. Copied to the employee's documents when hired.
class ApplicantDocument extends Model
{
    protected $fillable = ['applicant_id', 'type', 'path', 'original_name', 'mime', 'size', 'uploaded_by'];

    protected $hidden = ['path'];

    public function applicant()
    {
        return $this->belongsTo(Applicant::class);
    }
}
