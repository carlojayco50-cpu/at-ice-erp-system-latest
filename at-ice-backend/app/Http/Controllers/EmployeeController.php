<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use App\Services\AddressFormatter;
use App\Services\DriverLicense;
use App\Services\PhoneFormatter;
use App\Support\Audit;
use App\Support\Lateness;
use App\Support\Rates;
use App\Support\Settings;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

    // Login email made from the last name and employee number, e.g. Jayco,
    // EMP-0014 -> jayco.0014@atice.cloud (letters only, lower case). The
    // employee number is unique, so the email is too.
    public static function employeeEmail(string $lastName, string $code): string
    {
        $last = preg_replace('/[^a-z]/', '', strtolower(\Illuminate\Support\Str::ascii($lastName))) ?: 'employee';

        return $last.'.'.preg_replace('/\D/', '', $code).'@atice.cloud';
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

    // Driver's license number in the LTO format (N01-23-456789).
    private function cleanLicense(Request $request): void
    {
        if ($request->has('license_number')) {
            $request->merge(['license_number' => DriverLicense::normalize($request->license_number)]);
        }
    }

    // Monthly-rated employees: the daily rate is worked out from the monthly
    // rate (App\Support\Rates), so everything that uses daily_rate keeps working.
    private function cleanPay(Request $request): void
    {
        // Older clients send only the Day/Night label: use its default hours.
        if (! $request->filled('shift_start') && in_array($request->input('shift'), ['day', 'night'], true)) {
            $night = $request->input('shift') === 'night';
            $request->merge([
                'shift_start' => Settings::get($night ? 'attendance.night_shift_start' : 'attendance.shift_start'),
                'shift_end' => Settings::get($night ? 'attendance.night_shift_end' : 'attendance.shift_end'),
            ]);
        }
        if ($request->input('pay_basis') === 'monthly' && is_numeric($request->input('monthly_rate'))) {
            $request->merge(['daily_rate' => Rates::dailyFromMonthly((float) $request->input('monthly_rate'))]);
        }
        if ($request->input('pay_basis') === 'daily') {
            $request->merge(['monthly_rate' => null]);
        }
    }

    // Probationary or regular, daily or monthly pay, and the shift hours.
    private function workRules(): array
    {
        return [
            'employment_status' => 'sometimes|in:probationary,regular',
            'regularized_at' => 'nullable|date',
            'pay_basis' => 'sometimes|in:daily,monthly',
            'monthly_rate' => 'nullable|required_if:pay_basis,monthly|numeric|min:0|max:1000000',
            'shift_start' => 'nullable|date_format:H:i',
            'shift_end' => 'nullable|date_format:H:i',
        ];
    }

    // A new hire may start up to 14 days from today. Until then they are left
    // out of attendance, the kiosk and payroll.
    public const HIRE_DAYS_AHEAD = 14;

    public static function latestHireDate(): string
    {
        return now('Asia/Manila')->addDays(self::HIRE_DAYS_AHEAD)->toDateString();
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

    // One-time password of a new employee account: 12 random characters with an
    // uppercase letter, a lowercase letter, a digit and a symbol (so it passes the
    // password rules), without look-alike characters (O 0, l 1 I) because HR reads
    // it out or writes it down. It comes from random_int(), the secure generator,
    // and is not built from any detail of the employee. It is shown to HR once, in
    // the response that creates the account, and stored only as a hash. The
    // account must change it on first login.
    private static function oneTimePassword(): string
    {
        $sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
        $all = implode('', $sets);

        $chars = array_map(fn ($set) => $set[random_int(0, strlen($set) - 1)], $sets);
        while (count($chars) < 12) {
            $chars[] = $all[random_int(0, strlen($all) - 1)];
        }
        for ($i = count($chars) - 1; $i > 0; $i--) { // shuffle
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }

        return implode('', $chars);
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

    // GET employees?status=active (default) | inactive (archived) | all
    public function index(Request $request)
    {
        $status = $request->query('status', 'active');
        $employees = Employee::with(['user', 'faceData:id,employee_id,photo_path,created_at,updated_at', 'deactivatedBy:id,name'])
            ->when($status === 'active', fn ($q) => $q->where('is_active', true))
            ->when($status === 'inactive', fn ($q) => $q->where('is_active', false))
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
        $this->cleanLicense($request);
        $this->cleanPay($request);

        $noAccount = in_array($request->position, self::NO_ACCOUNT_POSITIONS, true);

        $request->validate($this->nameRules() + $this->workRules() + [
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            // The login email is made by the server (employeeEmail), never sent.
            // No password from HR either: the server makes a random one-time
            // password (oneTimePassword). The phone is required for an account so
            // HR can reach the employee.
            'phone' => [$noAccount ? 'nullable' : 'required', 'regex:'.self::PHONE_REGEX],
            'street' => 'required|string|max:255',
            'barangay' => 'required|string|max:255',
            'city' => 'required|string|max:255',
            'province' => 'required|string|max:255',
            'block_lot' => 'nullable|string|max:255',
            'subdivision' => 'nullable|string|max:255',
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            ...AddressFormatter::PSGC_RULES,
            'position' => ['required', Rule::in(array_keys(self::POSITION_ROLES))],
            'daily_rate' => 'required|numeric|min:0|max:100000',
            'department' => ['nullable', Rule::in(self::DEPARTMENTS)],
            // Past dates, or up to 14 days ahead (R3)
            'date_hired' => ['required', 'date', 'before_or_equal:'.self::latestHireDate()],
            // The old Day/Night label is worked out from the time range.
            'shift' => 'nullable|in:day,night',
            'shift_start' => 'required|date_format:H:i',
            'shift_end' => 'required|date_format:H:i',
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
            // Required for Drivers; ignored for every other position.
            'license_number' => [
                (self::POSITION_ROLES[$request->position] ?? null) === 'driver' ? 'required' : 'nullable',
                'regex:'.DriverLicense::REGEX,
                Rule::unique('employees', 'license_number'),
            ],
            'license_expiry' => DriverLicense::expiryRules((self::POSITION_ROLES[$request->position] ?? null) === 'driver'),
        ], DriverLicense::EXPIRY_MESSAGES + [
            'phone.regex' => self::PHONE_MESSAGE,
            'license_number.required' => "Enter the driver's license number.",
            'license_number.regex' => DriverLicense::MESSAGE,
            'license_number.unique' => 'Another employee already has this license number.',
        ] + ['date_hired.before_or_equal' => 'The hire date can be at most '.self::HIRE_DAYS_AHEAD.' days from today.'] + self::NAME_MESSAGES);

        // The login role is derived from Position, so the two cannot disagree.
        // Any sub_role sent by the client is ignored.
        $subRole = self::POSITION_ROLES[$request->position];
        $isDriver = $subRole === 'driver';

        $password = $noAccount ? null : self::oneTimePassword();

        // Login and employee record are created together, or not at all.
        // Retried when two employees added at the same moment get the same code.
        for ($attempt = 1; ; $attempt++) {
            try {
                [$user, $employee] = DB::transaction(fn () => $this->createEmployee($request, $noAccount, $isDriver, $subRole, $password));
                break;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 3) {
                    throw $e;
                }
            }
        }

        return response()->json([
            'message' => 'Employee created successfully!',
            'employee' => $employee,
            // Sent back ONCE, in this response only, so HR can hand them over (null: no
            // account). The password is never returned, logged or emailed anywhere else.
            'email' => $user?->email,
            'password' => $password,
        ], 201);
    }

    // The login (when the position has one) and the employee row, with the next free code.
    private function createEmployee(Request $request, bool $noAccount, bool $isDriver, string $subRole, ?string $password): array
    {
        $code = self::nextEmployeeCode();
        $user = null;
        if (! $noAccount) {
            $user = User::create([
                'name' => Employee::composeName($request->first_name, $request->middle_initial, $request->last_name, $request->suffix),
                'email' => self::employeeEmail($request->last_name, $code),
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
            'region' => $request->region,
            'barangay_code' => $request->barangay_code,
            'postal_code' => $request->postal_code,
            'position' => $request->position,
            'department' => $request->department,
            'daily_rate' => $request->daily_rate,
            'date_hired' => $request->date_hired,
            'employment_type' => $request->employment_type,
            'shift' => Lateness::label($request->shift_start, $request->shift_end),
            'shift_start' => $request->shift_start,
            'shift_end' => $request->shift_end,
            'pay_basis' => $request->pay_basis ?? 'daily',
            'monthly_rate' => $request->pay_basis === 'monthly' ? $request->monthly_rate : null,
            // New hires start probationary unless HR says otherwise.
            'employment_status' => $request->employment_status ?? 'probationary',
            'regularized_at' => ($request->employment_status ?? 'probationary') === 'regular'
                ? ($request->regularized_at ?? $request->date_hired)
                : null,
            // Only ever meaningful for Driver rows; left null for everyone
            // else regardless of what the request sends.
            'vehicle_plate' => $isDriver ? $request->vehicle_plate : null,
            'license_number' => $isDriver ? $request->license_number : null,
            'license_expiry' => $isDriver ? $request->license_expiry : null,
        ]);

        return [$user, $employee];
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
        $this->cleanLicense($request);
        $this->cleanPay($request);
        $isDriver = $employee->user?->role === 'driver';

        // Old employees have only the single free-text address and can be edited
        // without the new fields. But once any new address field is filled (or the
        // record already has them), Street, Barangay, City and Province are all
        // required, so the one-line address is never rebuilt from a partial set.
        $hasStructured = $employee->street !== null || $employee->barangay !== null;
        $addressRule = $hasStructured
            ? 'required|string|max:255'
            : 'nullable|string|max:255|required_with:block_lot,street,subdivision,barangay,city,province,postal_code';

        $request->validate($this->nameRules() + $this->workRules() + [
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
            ...AddressFormatter::PSGC_RULES,
            'vehicle_plate' => 'nullable|string|max:20',
            'license_number' => [
                $isDriver ? 'required' : 'nullable',
                'regex:'.DriverLicense::REGEX,
                Rule::unique('employees', 'license_number')->ignore($employee->id),
            ],
            // An unchanged date is not checked again (a saved license may have
            // expired since); a new or changed one must still be valid.
            'license_expiry' => $request->license_expiry !== null && $request->license_expiry === $employee->license_expiry?->toDateString()
                ? ['nullable']
                : DriverLicense::expiryRules($isDriver),
            'date_hired' => ['sometimes', 'date', 'before_or_equal:'.self::latestHireDate()],
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
        ], DriverLicense::EXPIRY_MESSAGES + [
            'phone.regex' => self::PHONE_MESSAGE,
            'license_number.required' => "Enter the driver's license number.",
            'license_number.regex' => DriverLicense::MESSAGE,
            'license_number.unique' => 'Another employee already has this license number.',
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
            'region',
            'barangay_code',
            'postal_code',
            'position',
            'department',
            'daily_rate',
            'shift',
            'employment_type',
            'employment_status',
            'regularized_at',
            'pay_basis',
            'monthly_rate',
            'shift_start',
            'shift_end',
            'vehicle_plate',
            'license_number',
            'license_expiry',
        ]);
        if (! $isDriver) {
            unset($data['license_number'], $data['license_expiry']);
        }

        // Rebuild the one-line address only when the separate fields were sent.
        $composed = AddressFormatter::compose($data + $employee->only(AddressFormatter::FIELDS));
        if ($request->hasAny(['street', 'barangay', 'subdivision', 'block_lot']) && $composed !== null) {
            $data['address'] = $composed;
        }

        if (isset($data['shift_start'], $data['shift_end'])) {
            $data['shift'] = Lateness::label($data['shift_start'], $data['shift_end']);
        }

        // Made regular: leave credits count from this date (docs/REVIEW-DECISIONS.md).
        $regularized = ($data['employment_status'] ?? null) === 'regular' && $employee->employment_status !== 'regular';
        if ($regularized && empty($data['regularized_at'])) {
            $data['regularized_at'] = now()->toDateString();
        }

        $employee->update($data);
        if ($regularized) {
            Audit::log('employee.regularized', $employee, ['employment_status' => 'probationary'], ['employment_status' => 'regular', 'regularized_at' => $employee->regularized_at?->toDateString()]);
        }

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
    // Never a hard delete: the row is kept (Archived), with who deactivated it
    // and when, and can be reactivated for a rehire.
    public function destroy(Request $request, $id)
    {
        $employee = Employee::with('user')->findOrFail($id);
        if (! $employee->is_active) {
            return response()->json(['message' => 'This employee is already inactive.'], 422);
        }
        $employee->update(['is_active' => false, 'deactivated_at' => now(), 'deactivated_by' => $request->user()?->id]);

        if ($employee->user) {
            $employee->user->update(['is_active' => false]);
            // Revoke all Sanctum tokens so any open session stops working immediately.
            $employee->user->tokens()->delete();
        }
        Audit::log('employee.deactivated', $employee, ['status' => 'active'], ['status' => 'inactive']);

        return response()->json([
            'message' => $employee->user
                ? 'Employee deactivated successfully! Their login account has been disabled.'
                : 'Employee deactivated successfully!',
        ]);
    }

    // POST employees/{id}/reactivate : a rehire keeps the same employee ID and
    // history; their login works again with the same email and password.
    public function reactivate($id)
    {
        $employee = Employee::with('user')->findOrFail($id);
        if ($employee->is_active) {
            return response()->json(['message' => 'This employee is already active.'], 422);
        }
        $employee->update(['is_active' => true, 'deactivated_at' => null, 'deactivated_by' => null]);
        $employee->user?->update(['is_active' => true]);
        Audit::log('employee.reactivated', $employee, ['status' => 'inactive'], ['status' => 'active']);

        return response()->json([
            'message' => "{$employee->full_name} ({$employee->employee_id}) is active again.",
            'employee' => $employee->fresh(),
        ]);
    }
}
