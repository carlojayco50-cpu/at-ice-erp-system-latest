<?php

namespace App\Http\Controllers;

use App\Models\Applicant;
use App\Services\PhoneFormatter;
use Carbon\Carbon;
use Illuminate\Http\Request;
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
            ->orderByRaw('interview_date IS NULL')   // scheduled first
            ->orderBy('interview_date', 'asc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($applicants);
    }

    // GET single applicant
    public function show($id)
    {
        $applicant = Applicant::findOrFail($id);

        return response()->json($applicant);
    }

    // CREATE applicant + schedule interview (HR)
    // New applicants always start as "pending".
    public function store(Request $request)
    {
        $this->cleanPhone($request);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email:rfc,filter,dns|max:255',
            'phone' => ['nullable', 'regex:'.self::PHONE_REGEX],
            'position_applied' => 'required|string|max:255',
            'interview_date' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ], [
            'phone.regex' => self::PHONE_MESSAGE,
        ]);

        $interviewDate = $this->normalizeDate($request->interview_date);

        if ($interviewDate && $interviewDate <= $this->nowLocal()) {
            throw ValidationException::withMessages([
                'interview_date' => ['The interview date and time must be in the future.'],
            ]);
        }

        $applicant = Applicant::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'position_applied' => $request->position_applied,
            'interview_date' => $interviewDate,
            'status' => 'pending',
            'notes' => $request->notes,
        ]);

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

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'nullable|email:rfc,filter,dns|max:255',
            'phone' => ['nullable', 'regex:'.self::PHONE_REGEX],
            'position_applied' => 'sometimes|required|string|max:255',
            'interview_date' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ], [
            'phone.regex' => self::PHONE_MESSAGE,
        ]);

        $data = $request->only(['name', 'email', 'phone', 'position_applied', 'notes']);

        if ($request->exists('interview_date')) {
            $newDate = $this->normalizeDate($request->interview_date);
            $currentDate = $this->normalizeDate($applicant->getRawOriginal('interview_date'));

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

        $applicant->update($data);

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
