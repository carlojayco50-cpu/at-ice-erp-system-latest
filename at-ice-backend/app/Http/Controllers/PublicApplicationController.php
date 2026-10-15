<?php

namespace App\Http\Controllers;

use App\Models\Applicant;
use App\Models\Employee;
use App\Services\AddressFormatter;
use App\Services\PhoneFormatter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

// The public job application form (/apply), opened by scanning the QR code HR
// prints from HRIS > Interviews. No login: anyone with the link can apply.
// It only creates a pending applicant (source "qr"), with the resume or CV
// they attach, which HR sees in the
// Interviews tab with a live notice. Spam guards: a per-IP limit on the route,
// a hidden "website" field that people leave empty, and one open application
// per mobile number.
class PublicApplicationController extends Controller
{
    public function store(Request $request)
    {
        // Bots fill every field, including the hidden one. Look successful so
        // they do not retry, but save nothing.
        if (filled($request->input('website'))) {
            return response()->json(['message' => 'Application sent.'], 201);
        }

        if ($request->filled('phone')) {
            $request->merge(['phone' => PhoneFormatter::normalize((string) $request->phone)]);
        }
        $request->merge(['email' => Applicant::normalizeEmail($request->input('email'))]);

        $data = $request->validate([
            'name' => 'required|string|min:3|max:255',
            'phone' => ['required', 'regex:'.PhoneFormatter::MOBILE_REGEX],
            'email' => ['nullable', 'email:rfc,filter', 'max:255', Rule::unique('applicants', 'email')],
            // Employee ID from a referral link (/job-applications/EMP-0001)
            'referral' => 'nullable|string|max:20',
            'position_applied' => ['required', Rule::in(Applicant::POSITIONS)],
            'notes' => 'nullable|string|max:1000',
            // Resume or CV: PDF or Word, up to 5 MB
            'resume' => Applicant::RESUME_RULE,
        ] + AddressFormatter::OPTIONAL_RULES, [
            'name.required' => 'Enter your full name.',
            'phone.required' => 'Enter your mobile number so HR can contact you.',
            'phone.regex' => PhoneFormatter::MOBILE_MESSAGE,
            'position_applied.required' => 'Choose the position you are applying for.',
            'position_applied.in' => 'Choose a position from the list.',
            'email.unique' => 'You already applied with this email. HR will contact you.',
            'postal_code.regex' => 'Postal code must be 4 digits.',
            'resume.mimes' => 'Attach your resume as a PDF or a Word file (DOC, DOCX).',
        ] + Applicant::RESUME_MESSAGES);

        // One open application per mobile number.
        $open = Applicant::where('phone', $data['phone'])->whereIn('status', ['pending', 'interviewed'])->exists();
        if ($open) {
            throw ValidationException::withMessages([
                'phone' => ['You already have an application with this mobile number. HR will contact you.'],
            ]);
        }

        // Kept on the private disk: only HR can open it (ApplicantController@resume).
        $resume = $request->file('resume');
        $resumePath = $resume?->store('resumes', 'local');
        $resumeName = $resume ? mb_substr(preg_replace('/[^\pL\pN ._()-]/u', '_', $resume->getClientOriginalName()), 0, 255) : null;

        // Referral: recorded only (no automatic bonus; Admin adds one in payroll).
        $referrer = filled($data['referral'] ?? null)
            ? Employee::where('employee_id', strtoupper(trim($data['referral'])))->where('is_active', true)->value('id')
            : null;

        Applicant::create([
            'name' => trim($data['name']),
            'phone' => $data['phone'],
            'email' => $data['email'] ?? null,
            'position_applied' => $data['position_applied'],
            // What the applicant wrote goes in the notes, marked as theirs.
            'notes' => filled($data['notes'] ?? null) ? 'From the applicant: '.trim($data['notes']) : null,
            'status' => 'pending',
            'source' => 'qr',
            'referred_by_employee_id' => $referrer,
            'resume_path' => $resumePath ?: null,
            'resume_name' => $resumePath ? $resumeName : null,
        ] + array_intersect_key($data, AddressFormatter::OPTIONAL_RULES));

        return response()->json(['message' => 'Application sent.'], 201);
    }
}
