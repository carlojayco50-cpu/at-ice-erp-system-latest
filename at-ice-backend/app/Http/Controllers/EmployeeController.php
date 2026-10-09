<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use App\Services\AddressFormatter;
use App\Services\PhoneFormatter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    // Position => role. Guard and Bagger get no login account (attendance only).
    private const POSITION_ROLES = [
        'Checker' => 'checker',
        'Salesman' => 'salesman',
        'Maintenance' => 'maintenance',
        'Driver' => 'driver',
        'Guard' => 'guard',
        'Bagger' => 'bagger',
    ];

    private const NO_ACCOUNT_POSITIONS = ['Guard', 'Bagger'];

    // Departments HR picks from (by the department the applicant applied to).
    public const DEPARTMENTS = [
        'Operations', 'Sales', 'Maintenance', 'Logistics',
        'Security', 'Production', 'Administration', 'Human Resources',
    ];

    // Login email made from the name and employee code, e.g. Carlo Jade Jayco,
    // EMP-0014 -> jayco.carlojade.0014@atice.cloud (letters only, lower case).
    private static function employeeEmail(string $lastName, string $firstName, string $code): string
    {
        $part = fn ($v) => preg_replace('/[^a-z]/', '', strtolower(\Illuminate\Support\Str::ascii($v))) ?: 'employee';

        return $part($lastName).'.'.$part($firstName).'.'.preg_replace('/\D/', '', $code).'@atice.cloud';
    }

    // Next free code: EMP-0001, EMP-0002, ... (one above the highest in use).
    private static function nextEmployeeCode(): string
    {
        $max = Employee::where('employee_id', 'like', 'EMP-%')->pluck('employee_id')
            ->map(fn ($c) => (int) substr($c, 4))
            ->max() ?? 0;

        return 'EMP-'.str_pad($max + 1, 4, '0', STR_PAD_LEFT);
    }

    private const PHONE_REGEX = PhoneFormatter::MOBILE_REGEX;

    private const PHONE_MESSAGE = PhoneFormatter::MOBILE_MESSAGE;

    // Stores the phone as +63XXXXXXXXXX. "0917 123 4567" and "+63 917 123 4567" are accepted.
    private function cleanPhone(Request $request): void
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => PhoneFormatter::normalize((string) $request->phone)]);
        }
    }

    // Middle initial: letters only, upper case ("d." -> "D"). Blank values are
    // stored as null so the full name has no stray dot or space.
    private function cleanNameParts(Request $request): void
    {
        if ($request->has('middle_initial')) {
            $mi = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) $request->middle_initial));
            $request->merge(['middle_initial' => $mi === '' ? null : $mi]);
        }
        if ($request->has('suffix') && trim((string) $request->suffix) === '') {
            $request->merge(['suffix' => null]);
        }
    }

    // Password of a new employee account: last name + last two digits of the
    // phone + "!", e.g. "Jayco" with +639171234550 -> "Jayco50!", and
    // "dela cruz" -> "DelaCruz50!". The frontend shows HR the same value
    // (defaultPassword in src/lib/password.js) to hand over.
    private static function defaultPassword(string $lastName, string $phone): string
    {
        $words = preg_split('/\s+/', trim($lastName)) ?: [];
        $name = '';
        foreach ($words as $w) {
            $w = preg_replace('/[^\p{L}]/u', '', $w);
            if ($w !== '') {
                $name .= mb_strtoupper(mb_substr($w, 0, 1)).mb_strtolower(mb_substr($w, 1));
            }
        }

        return ($name ?: 'Employee').substr(preg_replace('/\D/', '', $phone), -2).'!';
    }

    private const NAME_MESSAGES = [
        'middle_initial.regex' => 'Middle initial must be one or two letters.',
        'suffix.in' => 'Choose a suffix from the list.',
    ];

    private function nameRules(): array
    {
        return [
            'middle_initial' => ['nullable', 'regex:/^[A-Z]{1,2}$/'],
            'suffix' => ['nullable', Rule::in(Employee::SUFFIXES)],
        ];
    }

    public function index()
    {
        $employees = Employee::with(['user', 'faceData:id,employee_id,photo_path,created_at,updated_at'])
            ->where('is_active', true)
            ->where(function ($q) {
                $q->whereHas('user', function ($q) {
                    $q->where(function ($q2) {
                        $q2->where('role', 'employee')
                            ->whereIn('sub_role', ['checker', 'salesman', 'maintenance']);
                    })->orWhere('role', 'driver');
                })->orWhere(function ($q) {
                    // Guards and Baggers: no login account
                    $q->whereNull('user_id')->whereIn('position', self::NO_ACCOUNT_POSITIONS);
                });
            })
            ->get();

        return response()->json($employees);
    }

    // POST create employee
    public function store(Request $request)
    {
        $this->cleanPhone($request);
        $this->cleanNameParts($request);

        $noAccount = in_array($request->position, self::NO_ACCOUNT_POSITIONS, true);

        $request->validate($this->nameRules() + [
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            // The login email is made by the server (employeeEmail), never sent.
            // No password from HR: it is made from the last name and this
            // number (see defaultPassword), so the phone is required for an account.
            'phone' => [$noAccount ? 'nullable' : 'required', 'regex:'.self::PHONE_REGEX],
            'street' => 'required|string|max:255',
            'barangay' => 'required|string|max:255',
            'city' => 'required|string|max:255',
            'province' => 'required|string|max:255',
            'block_lot' => 'nullable|string|max:255',
            'subdivision' => 'nullable|string|max:255',
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            'position' => ['required', Rule::in(array_keys(self::POSITION_ROLES))],
            'daily_rate' => 'required|numeric|min:0|max:100000',
            'department' => ['nullable', Rule::in(self::DEPARTMENTS)],
            'date_hired' => 'required|date|before_or_equal:today',
            'shift' => 'required|in:day,night',
            'employment_type' => 'required|in:regular,contractual,part_time',
            // 'driver' added (v29.7) — Driver is now manageable from this
            // page, but is NOT a real sub_role; see below, it maps to its
            // own top-level `role` instead so the
            // role:driver routes keep working unchanged.
            'sub_role' => 'nullable|in:checker,salesman,maintenance,driver,guard,bagger',
            // vehicle_plate: only meaningful for Driver, but validated
            // generically here — the frontend only shows/sends this field
            // when Employee Role is set to Driver.
            'vehicle_plate' => 'nullable|string|max:20',
        ], [
            'phone.regex' => self::PHONE_MESSAGE,
        ] + self::NAME_MESSAGES);

        // The login role is derived from Position, so the two cannot disagree.
        // Any sub_role sent by the client is ignored.
        $subRole = self::POSITION_ROLES[$request->position];
        $isDriver = $subRole === 'driver';

        $code = self::nextEmployeeCode();
        $user = null;
        $password = null;
        if (! $noAccount) {
            $password = self::defaultPassword($request->last_name, $request->phone);

            $user = User::create([
                'name' => Employee::composeName($request->first_name, $request->middle_initial, $request->last_name, $request->suffix),
                'email' => self::employeeEmail($request->last_name, $request->first_name, $code),
                'password' => Hash::make($password),
                // Driver keeps its own top-level role, not employee+sub_role —
                // this is what keeps the role:driver routes
                // working exactly as before, with no changes needed there.
                'role' => $isDriver ? 'driver' : 'employee',
                'sub_role' => $isDriver ? null : $subRole,
                'is_active' => true,
                // Same as new customer accounts: the default password is one-time
                // and must be changed on first login.
                'must_change_password' => true,
            ]);
        }

        // Create employee record
        $employee = Employee::create([
            'user_id' => $user?->id,
            'employee_id' => $code,
            'first_name' => $request->first_name,
            'middle_initial' => $request->middle_initial,
            'last_name' => $request->last_name,
            'suffix' => $request->suffix,
            'phone' => $request->phone,
            // One-line address rebuilt from the separate fields.
            'address' => AddressFormatter::compose($request->only(AddressFormatter::FIELDS)),
            'block_lot' => $request->block_lot,
            'street' => $request->street,
            'subdivision' => $request->subdivision,
            'barangay' => $request->barangay,
            'city' => $request->city,
            'province' => $request->province,
            'postal_code' => $request->postal_code,
            'position' => $request->position,
            'department' => $request->department,
            'daily_rate' => $request->daily_rate,
            'date_hired' => $request->date_hired,
            'employment_type' => $request->employment_type,
            'shift' => $request->shift,
            // Only ever meaningful for Driver rows; left null for everyone
            // else regardless of what the request sends.
            'vehicle_plate' => $isDriver ? $request->vehicle_plate : null,
        ]);

        return response()->json([
            'message' => 'Employee created successfully!',
            'employee' => $employee,
            // Sent back once so HR can give them to the employee (null: no account).
            'email' => $user?->email,
            'password' => $password,
        ], 201);
    }

    // GET single employee
    public function show($id)
    {
        $employee = Employee::with('user')->findOrFail($id);

        return response()->json($employee);
    }

    // PUT update employee
    public function update(Request $request, $id)
    {
        $employee = Employee::findOrFail($id);

        $this->cleanPhone($request);
        $this->cleanNameParts($request);

        // Old employees have only the single free-text address and can be edited
        // without the new fields. But once any new address field is filled (or the
        // record already has them), Street, Barangay, City and Province are all
        // required, so the one-line address is never rebuilt from a partial set.
        $hasStructured = $employee->street !== null || $employee->barangay !== null;
        $addressRule = $hasStructured
            ? 'required|string|max:255'
            : 'nullable|string|max:255|required_with:block_lot,street,subdivision,barangay,city,province,postal_code';

        $request->validate($this->nameRules() + [
            'first_name' => 'sometimes|required|string',
            'last_name' => 'sometimes|required|string',
            'phone' => ['nullable', 'regex:'.self::PHONE_REGEX],
            'street' => $addressRule,
            'barangay' => $addressRule,
            'city' => $addressRule,
            'province' => $addressRule,
            'block_lot' => 'nullable|string|max:255',
            'subdivision' => 'nullable|string|max:255',
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            'vehicle_plate' => 'nullable|string|max:20',
            'date_hired' => 'sometimes|date|before_or_equal:today',
            // Editable any time (promotion, rate change); payroll uses the saved rate.
            'daily_rate' => 'sometimes|required|numeric|min:0|max:100000',
            // From the list; an older free-text value is kept if left unchanged.
            'department' => [
                'nullable',
                function ($attribute, $value, $fail) use ($employee) {
                    if ($value !== $employee->department && ! in_array($value, self::DEPARTMENTS, true)) {
                        $fail('Choose a department from the list.');
                    }
                },
            ],
            // Position is tied to the login role, so it cannot be changed here.
            // An unchanged value is accepted, even an old one outside the list.
            'position' => [
                'sometimes',
                function ($attribute, $value, $fail) use ($employee) {
                    if ($value !== $employee->position) {
                        $fail('Position cannot be changed. It is tied to the login role.');
                    }
                },
            ],
        ], [
            'phone.regex' => self::PHONE_MESSAGE,
        ] + self::NAME_MESSAGES);

        $data = $request->only([
            'first_name',
            'middle_initial',
            'last_name',
            'suffix',
            'phone',
            'block_lot',
            'street',
            'subdivision',
            'barangay',
            'city',
            'province',
            'postal_code',
            'position',
            'department',
            'daily_rate',
            'shift',
            'employment_type',
            'vehicle_plate',
        ]);

        // Rebuild the one-line address only when the separate fields were sent.
        $composed = AddressFormatter::compose($data + $employee->only(AddressFormatter::FIELDS));
        if ($request->hasAny(['street', 'barangay', 'subdivision', 'block_lot']) && $composed !== null) {
            $data['address'] = $composed;
        }

        $employee->update($data);

        // Keep the login account name in step with the employee name.
        if ($employee->user && $request->hasAny(['first_name', 'middle_initial', 'last_name', 'suffix'])) {
            $employee->user->update(['name' => $employee->full_name]);
        }

        return response()->json([
            'message' => 'Employee updated successfully!',
            'employee' => $employee,
        ]);
    }

    // DELETE (soft delete — set is_active to false)
    // Deactivating an employee also disables the login account and signs it
    // out everywhere, so a former employee can no longer access the system.
    // Attendance, payroll and inventory history are kept.
    public function destroy($id)
    {
        $employee = Employee::with('user')->findOrFail($id);
        $employee->update(['is_active' => false]);

        if ($employee->user) {
            $employee->user->update(['is_active' => false]);
            // Revoke all Sanctum tokens so any open session stops working immediately.
            $employee->user->tokens()->delete();
        }

        return response()->json([
            'message' => $employee->user
                ? 'Employee deactivated successfully! Their login account has been disabled.'
                : 'Employee deactivated successfully!',
        ]);
    }
}
