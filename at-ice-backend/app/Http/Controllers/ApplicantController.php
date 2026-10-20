<?php

namespace App\Http\Controllers;

use App\Models\Applicant;
use App\Services\AddressFormatter;
use App\Services\PhoneFormatter;
use App\Support\Audit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ApplicantController extends Controller
{
    private const LOCAL_TZ = 'Asia/Manila';

    // Philippine mobile number, stored as +639XXXXXXXXX (e.g. +639171234567)
    private const PHONE_REGEX = PhoneFormatter::MOBILE_REGEX;

    private const PHONE_MESSAGE = PhoneFormatter::MOBILE_MESSAGE;

    private function nowLocal(): string
    {
        return now(self::LOCAL_TZ)->format('Y-m-d H:i:s');
    }

    private function normalizeDate($value): ?string
    {
        if (! $value) {
            return null;
        }

        return Carbon::parse($value)->format('Y-m-d H:i:s');
    }

    // Stores the phone as +63XXXXXXXXXX. "0917 123 4567" and "+63 917 123 4567" are accepted.
    private function cleanPhone(Request $request): void
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => PhoneFormatter::normalize((string) $request->phone)]);
        }
    }

    // Interviews take 30 or 45 minutes and may not overlap. The message names
    // the interview in the way and the first free time after it.
    private function assertFreeSlot(string $start, int $minutes, ?int $exceptId = null): void
    {
        $clash = Applicant::overlapping($start, $minutes, $exceptId);
        if (! $clash) {
            return;
        }
        $from = Carbon::parse($clash->getRawOriginal('interview_date'));
        $until = $from->copy()->addMinutes($clash->interview_minutes ?: 30);
        $free = Carbon::parse(Applicant::nextFreeSlot($start, $minutes, $exceptId));

        throw ValidationException::withMessages([
            'interview_date' => ["This overlaps {$clash->name}'s interview ({$from->format('g:i')}–{$until->format('g:i A')}). The next free time is {$free->format('M j, g:i A')}."],
        ]);
    }

    // A resume or CV HR attaches (PDF or Word), kept on the private disk like the
    // ones applicants send from /apply. Returns the columns to save.
    private function storeResume(Request $request): array
    {
        $file = $request->file('resume');
        if (! $file) {
            return [];
        }

        return [
            'resume_path' => $file->store('resumes', 'local'),
            'resume_name' => mb_substr(preg_replace('/[^\pL\pN ._()-]/u', '_', $file->getClientOriginalName()), 0, 255),
        ];
    }

    private function assertTransition(Applicant $applicant, string $newStatus): void
    {
        $current = $applicant->status;

        if ($current === $newStatus) {
            return;
        }

        if (in_array($current, ['hired', 'rejected'], true)) {
            throw ValidationException::withMessages([
                'status' => ["This applicant is already {$current}. The status can no longer be changed."],
            ]);
        }

        switch ($newStatus) {
            case 'interviewed':
                if ($current !== 'pending') {
                    throw ValidationException::withMessages([
                        'status' => ['Only pending applicants can be marked as interviewed.'],
                    ]);
                }

                $interviewDate = $this->normalizeDate($applicant->getRawOriginal('interview_date'));

                if (! $interviewDate) {
                    throw ValidationException::withMessages([
                        'status' => ['Schedule an interview first before marking the applicant as interviewed.'],
                    ]);
                }

                if ($interviewDate > $this->nowLocal()) {
                    $when = Carbon::parse($interviewDate)->format('M j, Y g:i A');
                    throw ValidationException::withMessages([
                        'status' => ["The interview is scheduled on {$when}. It can be marked as interviewed only after that time."],
                    ]);
                }
                break;

            case 'hired':
                if ($current !== 'interviewed') {
                    throw ValidationException::withMessages([
                        'status' => ['Only interviewed applicants can be hired.'],
                    ]);
                }
                break;

            case 'rejected':
                // Allowed from pending or interviewed (final states handled above).
                break;

            case 'pending':
                throw ValidationException::withMessages([
                    'status' => ['An applicant cannot be moved back to pending.'],
                ]);
        }
    }

    // GET all applicants (HR)
    public function index(Request $request)
    {
        $query = Applicant::query();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('position_applied')) {
            $query->where('position_applied', $request->position_applied);
        }

        $applicants = $query
            ->with(['referredBy:id,employee_id,first_name,middle_initial,last_name,suffix', 'documents'])
            ->orderByRaw('interview_date IS NULL')   // scheduled first
            ->orderBy('interview_date', 'asc')
            ->orderBy('created_at', 'desc')
            ->get();

        // Possible duplicates: same name and address, different email. HR sees
        // when each was sent and decides which one is valid.
        $byKey = Applicant::all()->groupBy(fn (Applicant $a) => $a->duplicateKey() ?? "solo-{$a->id}");
        foreach ($applicants as $a) {
            $key = $a->duplicateKey();
            $a->setAttribute('possible_duplicates', $key === null ? [] : $byKey->get($key, collect())
                ->where('id', '!=', $a->id)
                ->filter(fn ($o) => $o->email !== $a->email || $o->email === null)
                ->map(fn ($o) => ['id' => $o->id, 'name' => $o->name, 'email' => $o->email, 'status' => $o->status, 'created_at' => $o->created_at])
                ->values());
        }

        return response()->json($applicants);
    }

    // GET single applicant
    public function show($id)
    {
        $applicant = Applicant::with('documents')->findOrFail($id);

        return response()->json($applicant);
    }

    // CREATE applicant + schedule interview (HR)
    // New applicants always start as "pending".
    public function store(Request $request)
    {
        $this->cleanPhone($request);
        $request->merge(['email' => Applicant::normalizeEmail($request->input('email'))]);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['bail', 'nullable', Rule::unique('applicants', 'email')->ignore($id ?? null), 'email:rfc,filter,dns', 'max:255'],
            'phone' => ['nullable', 'regex:'.self::PHONE_REGEX],
            'position_applied' => 'required|string|max:255',
            'interview_date' => 'nullable|date',
            'interview_minutes' => ['nullable', 'integer', 'in:'.implode(',', Applicant::INTERVIEW_MINUTES)],
            'notes' => 'nullable|string|max:1000',
            'resume' => Applicant::RESUME_RULE,
        ] + AddressFormatter::OPTIONAL_RULES, [
            'phone.regex' => self::PHONE_MESSAGE,
            'email.unique' => Applicant::EMAIL_TAKEN,
            'postal_code.regex' => 'Postal code must be 4 digits.',
            'interview_minutes.in' => 'An interview takes 30 or 45 minutes.',
        ] + Applicant::RESUME_MESSAGES);

        $interviewDate = $this->normalizeDate($request->interview_date);

        if ($interviewDate && $interviewDate <= $this->nowLocal()) {
            throw ValidationException::withMessages([
                'interview_date' => ['The interview date and time must be in the future.'],
            ]);
        }
        $minutes = (int) ($request->interview_minutes ?: 30);
        if ($interviewDate) {
            $this->assertFreeSlot($interviewDate, $minutes);
        }

        $applicant = Applicant::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'position_applied' => $request->position_applied,
            'interview_date' => $interviewDate,
            'interview_minutes' => $minutes,
            'status' => 'pending',
            'notes' => $request->notes,
        ] + $this->storeResume($request) + $request->only(array_keys(AddressFormatter::OPTIONAL_RULES)));

        return response()->json([
            'message' => 'Applicant added successfully!',
            'applicant' => $applicant,
        ], 201);
    }

    // UPDATE applicant details / reschedule interview (HR)
    // Status is NOT changed here. Use the status endpoint so the rules apply.
    public function update(Request $request, $id)
    {
        $applicant = Applicant::findOrFail($id);

        // A hired or rejected applicant's interview record is final: view only.
        if (in_array($applicant->status, ['hired', 'rejected'], true)) {
            return response()->json(['message' => "This applicant is already {$applicant->status}. The interview record can no longer be edited."], 422);
        }

        $this->cleanPhone($request);
        $request->merge(['email' => Applicant::normalizeEmail($request->input('email'))]);

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['bail', 'nullable', Rule::unique('applicants', 'email')->ignore($id ?? null), 'email:rfc,filter,dns', 'max:255'],
            'phone' => ['nullable', 'regex:'.self::PHONE_REGEX],
            'position_applied' => 'sometimes|required|string|max:255',
            'interview_date' => 'nullable|date',
            'interview_minutes' => ['nullable', 'integer', 'in:'.implode(',', Applicant::INTERVIEW_MINUTES)],
            'notes' => 'nullable|string|max:1000',
            'resume' => Applicant::RESUME_RULE,
            // HR removes the saved resume (ignored when a new one replaces it)
            'remove_resume' => 'sometimes|boolean',
        ] + AddressFormatter::OPTIONAL_RULES, [
            'phone.regex' => self::PHONE_MESSAGE,
            'email.unique' => Applicant::EMAIL_TAKEN,
            'postal_code.regex' => 'Postal code must be 4 digits.',
            'interview_minutes.in' => 'An interview takes 30 or 45 minutes.',
        ] + Applicant::RESUME_MESSAGES);

        $data = $request->only(['name', 'email', 'phone', 'position_applied', 'notes', ...array_keys(AddressFormatter::OPTIONAL_RULES)]);

        if ($request->exists('interview_date')) {
            $newDate = $this->normalizeDate($request->interview_date);
            $currentDate = $this->normalizeDate($applicant->getRawOriginal('interview_date'));

            $minutes = (int) ($request->interview_minutes ?: $applicant->interview_minutes ?: 30);
            $data['interview_minutes'] = $minutes;
            $moved = $newDate !== $currentDate || $minutes !== (int) $applicant->interview_minutes;
            if ($moved && $newDate && $applicant->status === 'pending') {
                $this->assertFreeSlot($newDate, $minutes, $applicant->id);
            }

            if ($newDate !== $currentDate) {
                if ($applicant->status !== 'pending') {
                    throw ValidationException::withMessages([
                        'interview_date' => ['The interview schedule can only be changed while the applicant is pending.'],
                    ]);
                }

                if ($newDate && $newDate <= $this->nowLocal()) {
                    throw ValidationException::withMessages([
                        'interview_date' => ['The new interview date and time must be in the future.'],
                    ]);
                }

                $data['interview_date'] = $newDate;
            }
        }

        // A new resume replaces the old file; remove_resume drops it.
        $resume = $this->storeResume($request);
        $removed = ! $resume && $request->boolean('remove_resume') && $applicant->resume_path
            ? (string) $applicant->resume_name
            : null;
        if ($removed !== null) {
            $resume = ['resume_path' => null, 'resume_name' => null];
        }
        if ($resume && $applicant->resume_path) {
            Storage::disk('local')->delete($applicant->resume_path);
        }

        $applicant->update($data + $resume);

        if ($removed !== null) {
            Audit::log('applicant.resume_removed', $applicant, ['resume_name' => $removed], ['resume_name' => null]);
        }

        return response()->json([
            'message' => 'Applicant updated successfully!',
            'applicant' => $applicant->fresh(),
        ]);
    }

    // UPDATE status only (HR quick action) with transition rules
    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:pending,interviewed,hired,rejected',
        ]);

        $applicant = Applicant::findOrFail($id);

        $this->assertTransition($applicant, $request->status);

        $applicant->update(['status' => $request->status]);

        return response()->json([
            'message' => "Applicant marked as {$request->status}.",
            'applicant' => $applicant->fresh(),
        ]);
    }

    // DELETE applicant (HR)
    public function destroy($id)
    {
        $applicant = Applicant::findOrFail($id);
        if (in_array($applicant->status, ['hired', 'rejected'], true)) {
            return response()->json(['message' => "This applicant is already {$applicant->status}. The interview record is kept and can no longer be deleted."], 422);
        }
        $applicant->delete();

        return response()->json(['message' => 'Applicant deleted successfully.']);
    }

    // GET the resume or CV the applicant attached on the public form (HR only).
    // Shown in the browser (PDF, pictures) or downloaded (Word files).
    public function resume($id)
    {
        $applicant = Applicant::findOrFail($id);
        if (! $applicant->resume_path || ! Storage::disk('local')->exists($applicant->resume_path)) {
            return response()->json(['message' => 'This applicant has no resume attached.'], 404);
        }

        return Storage::disk('local')->response($applicant->resume_path, $applicant->resume_name ?: 'resume', [
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ], 'inline');
    }

    // GET a document the applicant attached on /apply (2x2 photo, ID...), HR only.
    public function document($id, $document)
    {
        $doc = \App\Models\ApplicantDocument::where('applicant_id', $id)->findOrFail($document);
        abort_unless(Storage::disk('local')->exists($doc->path), 404);

        return Storage::disk('local')->response($doc->path, $doc->original_name, [
            'Content-Type' => $doc->mime,
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ], 'inline');
    }

    // GET upcoming interviews (HR Dashboard)
    public function upcoming()
    {
        $applicants = Applicant::where('status', 'pending')
            ->whereNotNull('interview_date')
            ->where('interview_date', '>=', $this->nowLocal())
            ->orderBy('interview_date', 'asc')
            ->get();

        return response()->json($applicants);
    }
}
