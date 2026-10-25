<?php

namespace App\Support;

use App\Services\PhoneFormatter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// The biodata fields shared by employees and applicants (owner, 2026-10-20),
// and the government numbers of employees, with their formats:
//   SSS        XX-XXXXXXX-X      (10 digits)
//   TIN        XXX-XXX-XXX-000   (9 digits + 3-digit branch code, 000 if none)
//   PhilHealth XX-XXXXXXXXX-X    (12 digits)
//   Pag-IBIG   XXXX-XXXX-XXXX    (12 digits)
// Same rules as src/lib/biodata.js on the frontend.
class Biodata
{
    public const FIELDS = [
        'birth_date', 'sex', 'civil_status', 'nationality', 'place_of_birth', 'personal_email',
        'emergency_name', 'emergency_relationship', 'emergency_phone',
        'education_level', 'school', 'course', 'year_graduated', 'work_history', 'license_restrictions',
    ];

    public const GOV_FIELDS = ['sss_no', 'tin_no', 'philhealth_no', 'pagibig_no'];

    public const SEXES = ['male', 'female'];

    public const CIVIL_STATUSES = ['single', 'married', 'widowed', 'separated'];

    public const EDUCATION_LEVELS = ['elementary', 'high_school', 'senior_high', 'vocational', 'college_undergraduate', 'college_graduate', 'postgraduate'];

    // LTO restriction codes (2021 codes and the older numeric ones still on cards)
    public const RESTRICTIONS = ['A', 'A1', 'B', 'B1', 'B2', 'BE', 'C', 'CE', 'D', '1', '2', '3', '4', '5', '6', '7', '8'];

    public const DOCUMENT_TYPES = ['resume', 'photo', 'nbi', 'government_id', 'diploma', 'other'];

    // [digits, pattern for display]
    private const GOV_FORMATS = [
        'sss_no' => [10, [2, 7, 1]],
        'tin_no' => [12, [3, 3, 3, 3]],
        'philhealth_no' => [12, [2, 9, 1]],
        'pagibig_no' => [12, [4, 4, 4]],
    ];

    public const GOV_LABELS = ['sss_no' => 'SSS', 'tin_no' => 'TIN', 'philhealth_no' => 'PhilHealth', 'pagibig_no' => 'Pag-IBIG'];

    // Digits grouped with dashes, or the input unchanged when the digit count
    // is wrong (so validation can say so).
    public static function formatGov(string $field, ?string $value): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $value);
        if ($digits === '') {
            return null;
        }
        [$length, $groups] = self::GOV_FORMATS[$field];
        if ($field === 'tin_no' && strlen($digits) === 9) {
            $digits .= '000';
        }
        if (strlen($digits) !== $length) {
            return (string) $value;
        }
        $parts = [];
        $at = 0;
        foreach ($groups as $g) {
            $parts[] = substr($digits, $at, $g);
            $at += $g;
        }

        return implode('-', $parts);
    }

    public static function govPattern(string $field): string
    {
        [, $groups] = self::GOV_FORMATS[$field];

        return '/^'.implode('-', array_map(fn ($g) => '\d{'.$g.'}', $groups)).'$/';
    }

    // Cleans the request before validation: gov numbers formatted, mobile
    // number normalized, restriction codes as a comma list, empty work history
    // rows dropped.
    public static function clean(Request $request, bool $withGov = false): void
    {
        $merge = [];
        if ($withGov) {
            foreach (self::GOV_FIELDS as $f) {
                if ($request->has($f)) {
                    $merge[$f] = self::formatGov($f, $request->input($f));
                }
            }
        }
        if ($request->filled('emergency_phone')) {
            $merge['emergency_phone'] = PhoneFormatter::normalize((string) $request->emergency_phone);
        }
        if ($request->has('personal_email')) {
            $merge['personal_email'] = filled($request->personal_email) ? mb_strtolower(trim($request->personal_email)) : null;
        }
        if ($request->has('license_restrictions')) {
            $codes = $request->input('license_restrictions');
            $codes = is_array($codes) ? $codes : preg_split('/[\s,]+/', (string) $codes, -1, PREG_SPLIT_NO_EMPTY);
            $merge['license_restrictions'] = $codes ? implode(',', array_values(array_unique(array_map('strtoupper', $codes)))) : null;
        }
        if ($request->has('work_history')) {
            $rows = is_array($request->input('work_history')) ? $request->input('work_history') : [];
            $merge['work_history'] = array_values(array_filter($rows, fn ($r) => is_array($r) && filled($r['company'] ?? null)));
        }
        $request->merge($merge);
    }

    public static function rules(?int $ignoreEmployeeId = null, bool $withGov = false): array
    {
        $rules = [
            'birth_date' => 'nullable|date|before:-15 years|after:1930-01-01',
            'sex' => ['nullable', Rule::in(self::SEXES)],
            'civil_status' => ['nullable', Rule::in(self::CIVIL_STATUSES)],
            'nationality' => 'nullable|string|max:50',
            'place_of_birth' => 'nullable|string|max:120',
            'personal_email' => 'nullable|email:rfc,filter|max:255',
            'emergency_name' => 'nullable|string|max:120',
            'emergency_relationship' => 'nullable|string|max:40',
            'emergency_phone' => ['nullable', 'regex:'.PhoneFormatter::MOBILE_REGEX],
            'education_level' => ['nullable', Rule::in(self::EDUCATION_LEVELS)],
            'school' => 'nullable|string|max:160',
            'course' => 'nullable|string|max:160',
            'year_graduated' => 'nullable|integer|min:1950|max:'.(now(config('atice.timezone'))->year + 6),
            'work_history' => 'nullable|array|max:5',
            'work_history.*.company' => 'required|string|max:160',
            'work_history.*.position' => 'nullable|string|max:120',
            'work_history.*.from' => 'nullable|date_format:Y-m',
            'work_history.*.to' => 'nullable|date_format:Y-m',
            'license_restrictions' => ['nullable', 'string', 'max:40', function ($attr, $value, $fail) {
                foreach (explode(',', (string) $value) as $code) {
                    if (! in_array($code, self::RESTRICTIONS, true)) {
                        $fail("Unknown license restriction code {$code}.");
                    }
                }
            }],
        ];
        if ($withGov) {
            foreach (self::GOV_FIELDS as $f) {
                $unique = Rule::unique('employees', $f);
                $rules[$f] = ['nullable', 'regex:'.self::govPattern($f), $ignoreEmployeeId ? $unique->ignore($ignoreEmployeeId) : $unique];
            }
        }

        return $rules;
    }

    public static function messages(): array
    {
        $m = [
            'birth_date.before' => 'The birth date must be at least 15 years ago.',
            'emergency_phone.regex' => PhoneFormatter::MOBILE_MESSAGE,
            'work_history.*.company.required' => 'Enter the company of each work history row.',
            'work_history.*.from.date_format' => 'Use the month picker for the work history dates.',
            'work_history.*.to.date_format' => 'Use the month picker for the work history dates.',
        ];
        foreach (self::GOV_LABELS as $f => $label) {
            $m["{$f}.regex"] = "Enter the {$label} number in full.";
            $m["{$f}.unique"] = "Another employee already has this {$label} number.";
        }

        return $m;
    }
}
