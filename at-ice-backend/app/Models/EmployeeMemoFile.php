<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A file on a disciplinary memo, on the private disk: what HR attached (a
// signed memo, an NTE letter, CCTV stills, GPS logs, photos) or the scanned
// wet-signed copy that closes a memo needing physical sign-off.
class EmployeeMemoFile extends Model
{
    public const KINDS = ['attachment', 'signed_copy'];

    public const MIMES = 'pdf,jpg,jpeg,png,webp,docx';

    protected $fillable = ['employee_memo_id', 'kind', 'path', 'original_name', 'mime', 'size', 'uploaded_by'];

    protected $hidden = ['path'];

    public function memo()
    {
        return $this->belongsTo(EmployeeMemo::class, 'employee_memo_id');
    }
}
