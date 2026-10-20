<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Applicant extends Model
{
    use HasFactory;

    // Positions people can apply for (same list as the frontend, src/lib/positions.js).
    public const POSITIONS = ['Checker', 'Salesman', 'Maintenance', 'Driver', 'Guard', 'Bagger', 'Admin Staff'];

    // The only positions the public form (/apply) offers and accepts: field
    // roles. Office roles such as Admin Staff are never open to the public;
    // HR can still add those applicants in Interviews (POSITIONS).
    public const PUBLIC_POSITIONS = ['Checker', 'Salesman', 'Maintenance', 'Driver', 'Guard', 'Bagger'];

    // A resume or CV is a PDF or a Word file (applicant on /apply, or HR), up to 5 MB.
    public const RESUME_RULE = 'nullable|file|mimes:pdf,doc,docx|max:5120';

    public const RESUME_MESSAGES = [
        'resume.mimes' => 'Attach the resume or CV as a PDF or a Word file (DOC, DOCX).',
        'resume.max' => 'The resume is too large. Use a file up to 5 MB.',
        'resume.uploaded' => 'The resume could not be uploaded. Use a smaller file (up to 5 MB) and try again.',
    ];

    // Interviews take 30 to 45 minutes; HR picks one. Two interviews may not overlap.
    public const INTERVIEW_MINUTES = [30, 45];

    protected $fillable = [
        // Biodata (App\Support\Biodata)
        'birth_date', 'sex', 'civil_status', 'nationality', 'place_of_birth', 'personal_email',
        'emergency_name', 'emergency_relationship', 'emergency_phone',
        'education_level', 'school', 'course', 'year_graduated', 'work_history', 'license_restrictions',
        'license_number', 'license_expiry', 'consented_at', 'consent_ip',
        'name',
        'email',
        'phone',
        'block_lot',
        'street',
        'subdivision',
        'barangay',
        'city',
        'province',
        'region',
        'barangay_code',
        'postal_code',
        'position_applied',
        'interview_date',
        'interview_minutes',
        'status',
        'source',
        'referred_by_employee_id',
        'notes',
        'resume_path',
        'resume_name',
    ];

    // The file's place on the private disk stays on the server; HR opens it
    // through GET applicants/{id}/resume.
    protected $hidden = ['resume_path'];

    protected $casts = [
        'interview_date' => 'datetime:Y-m-d H:i:s',
        'birth_date' => 'date:Y-m-d',
        'license_expiry' => 'date:Y-m-d',
        'work_history' => 'array',
        'consented_at' => 'datetime',
    ];

    // Files attached on /apply (private disk)
    public function documents()
    {
        return $this->hasMany(ApplicantDocument::class)->latest();
    }

    // The pending interview that overlaps [start, start + minutes), if any
    // (another applicant's interview that has not ended when this one starts,
    // or starts before this one ends). Times are Y-m-d H:i:s, Manila time.
    public static function overlapping(string $start, int $minutes, ?int $exceptId = null): ?self
    {
        $end = Carbon::parse($start)->addMinutes($minutes);
        $from = Carbon::parse($start)->subMinutes(max(self::INTERVIEW_MINUTES));

        // Candidates start at most 45 minutes before this one and before it ends;
        // the exact check uses each one's own length.
        return self::where('status', 'pending')
            ->whereNotNull('interview_date')
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->where('interview_date', '>', $from->format('Y-m-d H:i:s'))
            ->where('interview_date', '<', $end->format('Y-m-d H:i:s'))
            ->orderBy('interview_date')
            ->get()
            ->first(fn ($a) => Carbon::parse($a->getRawOriginal('interview_date'))->addMinutes($a->interview_minutes ?: 30)->gt(Carbon::parse($start)));
    }

    // The first start time at or after $start when an interview of $minutes fits.
    public static function nextFreeSlot(string $start, int $minutes, ?int $exceptId = null): string
    {
        $at = Carbon::parse($start);
        for ($i = 0; $i < 50; $i++) {
            $clash = self::overlapping($at->format('Y-m-d H:i:s'), $minutes, $exceptId);
            if (! $clash) {
                break;
            }
            $at = Carbon::parse($clash->getRawOriginal('interview_date'))->addMinutes($clash->interview_minutes ?: 30);
        }

        return $at->format('Y-m-d H:i:s');
    }

    public const EMAIL_TAKEN = 'An application with this email already exists. One application per email.';

    // Emails are compared lower case and trimmed: "Juan@Mail.com " = "juan@mail.com".
    public static function normalizeEmail(?string $email): ?string
    {
        $email = mb_strtolower(trim((string) $email));

        return $email === '' ? null : $email;
    }

    // Name and address, lower case and trimmed, used to flag a possible
    // duplicate (same person, different email). Null without an address.
    public function duplicateKey(): ?string
    {
        $address = collect([$this->block_lot, $this->street, $this->subdivision, $this->barangay, $this->city, $this->province])
            ->map(fn ($v) => preg_replace('/\s+/', ' ', mb_strtolower(trim((string) $v))))
            ->filter()
            ->implode('|');

        return $address === '' ? null : preg_replace('/\s+/', ' ', mb_strtolower(trim((string) $this->name))).'#'.$address;
    }

    // The employee whose referral link the applicant used
    public function referredBy()
    {
        return $this->belongsTo(Employee::class, 'referred_by_employee_id');
    }

    protected static function booted(): void
    {
        // A deleted applicant's resume file goes too.
        static::deleted(function (Applicant $applicant) {
            if ($applicant->resume_path) {
                Storage::disk('local')->delete($applicant->resume_path);
            }
        });
    }
}
