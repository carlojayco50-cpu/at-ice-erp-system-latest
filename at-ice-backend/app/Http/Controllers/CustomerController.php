<?php

namespace App\Http\Controllers;

use App\Mail\AccountCredentials;
use App\Models\Customer;
use App\Models\User;
use App\Rules\ExistingMailbox;
use App\Services\AddressFormatter;
use App\Services\EmailVerifier;
use App\Services\GeocodingService;
use App\Services\PhoneFormatter;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Throwable;

class CustomerController extends Controller
{
    // Businesses may use mobile or landline numbers: +63 and 9 to 10 digits.
    private const CONTACT_REGEX = PhoneFormatter::ANY_REGEX;

    private const CONTACT_MESSAGE = PhoneFormatter::ANY_MESSAGE;

    // Stores the number as +63XXXXXXXXXX. A leading 0 or 63 is converted.
    private function cleanContactNumber(Request $request): void
    {
        if ($request->filled('contact_number')) {
            $request->merge(['contact_number' => PhoneFormatter::normalize((string) $request->contact_number)]);
        }
    }

    // Fields Admin can set. Codes, user_id and is_active are never taken from the request.
    private const INPUT_FIELDS = [
        'name', 'block_lot', 'street', 'subdivision', 'barangay', 'city', 'province',
        'postal_code', 'region', 'barangay_code', 'contact_person', 'contact_number', 'email', 'mop', 'notes',
        'invoice_code', 'customer_type', 'chain',
    ];

    private const INVOICE_CODE_MESSAGES = [
        'invoice_code.required' => 'Enter the invoice code, e.g. PG.',
        'invoice_code.regex' => 'The invoice code is 2 to 5 letters, e.g. PG.',
        'invoice_code.unique' => 'Another customer already uses this invoice code.',
    ];

    // Invoice code as capital letters only ("pg" -> "PG"); blank -> null.
    private function cleanInvoiceCode(Request $request): void
    {
        if ($request->has('invoice_code')) {
            $code = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) $request->invoice_code));
            $request->merge(['invoice_code' => $code === '' ? null : $code]);
        }
    }

    // Customer type (sets the reference prices). There is no chain field any
    // more (owner, 2026-10-20): the chain is worked out from the name.
    private static function groupRules(): array
    {
        return [
            'customer_type' => ['nullable', Rule::in(array_keys(Customer::TYPES))],
        ];
    }

    // The chain comes from the name (Customer::KNOWN_CHAINS: "SM Hypermarket
    // Tungko" -> SM) and is used only to pick a chain's stores on a contract.
    // A blank type is filled in from the name: a known chain's type, else
    // Dealers, so every customer has a type and therefore a reference price.
    // An unused mop (no longer on the form) is not sent to the database as null.
    private function cleanGroup(array $data): array
    {
        unset($data['chain']);
        if (array_key_exists('name', $data)) {
            $data['chain'] = Customer::knownChain(null, $data['name']);
        }
        if (array_key_exists('customer_type', $data) && empty($data['customer_type'])) {
            $data['customer_type'] = Customer::guessType(null, $data['name'] ?? null);
        }
        if (array_key_exists('mop', $data) && $data['mop'] === null) {
            unset($data['mop']);
        }

        return $data;
    }

    // GET /api/customers/invoice-code?name=...: the code a new customer would get.
    public function suggestInvoiceCode(Request $request)
    {
        $request->validate(['name' => 'required|string|max:255']);

        return response()->json(['invoice_code' => Customer::invoiceCodeFor($request->name)]);
    }

    public function index()
    {
        return response()->json(
            Customer::with('user:id,email')->where('is_active', true)->get()
        );
    }

    public function store(Request $request)
    {
        $this->cleanContactNumber($request);
        $this->cleanInvoiceCode($request);

        $request->validate([
            'name' => 'required|string|max:255',
            // The contact email is also the portal login, so it must be free.
            // The account itself must exist (ExistingMailbox), not just the domain.
            'email' => ['bail', 'required', 'email:rfc,filter,dns', 'max:255', 'unique:users,email', new ExistingMailbox],
            // No longer on the form (customers send a payment proof per invoice); kept for older data.
            'mop' => 'nullable|in:cash,gcash,check,bank_transfer',
            ...self::groupRules(),
            'contact_number' => ['required', 'regex:'.self::CONTACT_REGEX],
            'street' => 'required|string|max:255',
            'barangay' => 'required|string|max:255',
            'city' => 'required|string|max:255',
            'province' => 'required|string|max:255',
            'block_lot' => 'nullable|string|max:255',
            'subdivision' => 'nullable|string|max:255',
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            ...AddressFormatter::PSGC_RULES,
            'contact_person' => 'required|string|max:255',
            'notes' => 'nullable|string',
            'latitude' => 'nullable|numeric|between:-90,90|required_with:longitude',
            'longitude' => 'nullable|numeric|between:-180,180|required_with:latitude',
            // Made from the name when left blank.
            'invoice_code' => ['nullable', 'regex:'.Customer::INVOICE_CODE_REGEX, Rule::unique('customers', 'invoice_code')],
        ], [
            'contact_number.regex' => self::CONTACT_MESSAGE,
            'email.unique' => 'That email already has a login account. Use a different contact email.',
            'postal_code.regex' => 'Postal code must be 4 digits.',
        ] + self::INVOICE_CODE_MESSAGES);

        $data = $this->cleanGroup($request->only(self::INPUT_FIELDS));
        $data['invoice_code'] ??= Customer::invoiceCodeFor($data['name']);
        $data['address'] = AddressFormatter::compose($data);
        $data['is_active'] = true;

        // Pin: use one typed in under "Adjust map pin", otherwise geocode the address.
        $pinFound = false;
        if ($request->filled('latitude') && $request->filled('longitude')) {
            $data['latitude'] = (float) $request->latitude;
            $data['longitude'] = (float) $request->longitude;
            $pinFound = true;
        } elseif ($coords = $this->geocode($data)) {
            $data['latitude'] = $coords['latitude'];
            $data['longitude'] = $coords['longitude'];
            $pinFound = true;
        }

        $plainPassword = Str::random(10);

        // Customer and portal login are created together, or not at all.
        for ($attempt = 1; ; $attempt++) {
            try {
                $customer = DB::transaction(function () use ($data, $plainPassword) {
                    $user = User::create([
                        'name' => $data['name'],
                        'email' => $data['email'],
                        'password' => $plainPassword,
                        'role' => 'customer',
                        'must_change_password' => true,
                    ]);

                    return Customer::create($data + $this->generateCodes($data['name'], $data['city']) + [
                        'user_id' => $user->id,
                    ]);
                });
                break;
            } catch (UniqueConstraintViolationException $e) {
                // Two customers were created at the same moment and got the same code.
                if ($attempt >= 3) {
                    throw $e;
                }
            }
        }

        $emailed = $this->sendCredentials($customer->name, $data['email'], $plainPassword);

        return response()->json($customer->load('user:id,email')->toArray() + [
            'pin_found' => $pinFound,
            'login' => ['email' => $data['email'], 'password' => $plainPassword, 'emailed' => $emailed],
        ], 201);
    }

    // GET /api/customers/check-email?email=... : live check under Contact Email,
    // so Admin sees right away whether the account exists. Saving checks again.
    public function checkEmail(Request $request)
    {
        $request->validate(['email' => 'required|string|max:255']);

        return response()->json(['result' => app(EmailVerifier::class)->check($request->email)]);
    }

    public function show($id)
    {
        return response()->json(Customer::findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);

        $this->cleanContactNumber($request);
        $this->cleanInvoiceCode($request);

        // Old customers have only the single free-text address and can be edited
        // without the new fields. But once any new address field is filled (or the
        // record already has them), Street, Barangay, City and Province are all
        // required, so the one-line address is never rebuilt from a partial set.
        // City and Province are required on their own below (never emptied).
        $hasStructured = $customer->street !== null || $customer->barangay !== null;
        $addressRule = $hasStructured
            ? 'required|string|max:255'
            : 'nullable|string|max:255|required_with:block_lot,street,subdivision,barangay,postal_code';

        // Contact person, contact number and email are required when a customer is
        // added. When editing, they are checked only for a field that is being CHANGED
        // (including emptying one that has a value). So an old customer without them,
        // like the seeded ones, can still be edited, and nobody has to invent a
        // contact just to change the payment method.
        $same = fn ($a, $b) => mb_strtolower(trim((string) $a)) === mb_strtolower(trim((string) $b));
        $changing = fn (string $field) => $request->exists($field) && ! $same($request->input($field), $customer->{$field});

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            // A changed email must be an existing account, not another customer's email
            // and not another account's login. An unchanged one is not checked again.
            'email' => $changing('email')
                ? ['bail', 'required', 'email:rfc,filter,dns', 'max:255',
                    Rule::unique('customers', 'email')->ignore($customer->id)->whereNull('deleted_at'),
                    Rule::unique('users', 'email')->ignore($customer->user_id),
                    new ExistingMailbox]
                : ['nullable', 'string', 'max:255'],
            'mop' => 'sometimes|in:cash,gcash,check,bank_transfer',
            ...self::groupRules(),
            'street' => $addressRule,
            'barangay' => $addressRule,
            // City and Province can never be emptied: old customers already have them
            'city' => 'sometimes|required|string|max:255',
            'province' => 'sometimes|required|string|max:255',
            'block_lot' => 'nullable|string|max:255',
            'subdivision' => 'nullable|string|max:255',
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            ...AddressFormatter::PSGC_RULES,
            'contact_person' => $changing('contact_person') ? 'required|string|max:255' : 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'latitude' => 'nullable|numeric|between:-90,90|required_with:longitude',
            'longitude' => 'nullable|numeric|between:-180,180|required_with:latitude',
            // A saved number in an old format stays editable as long as it is not changed.
            'contact_number' => $changing('contact_number')
                ? ['required', 'regex:'.self::CONTACT_REGEX]
                : ['nullable'],
            // A changed code is used from the next invoice on; older invoices keep theirs.
            'invoice_code' => ['sometimes', 'required', 'regex:'.Customer::INVOICE_CODE_REGEX, Rule::unique('customers', 'invoice_code')->ignore($customer->id)],
        ], [
            'contact_number.regex' => self::CONTACT_MESSAGE,
            'postal_code.regex' => 'Postal code must be 4 digits.',
            'email.unique' => 'Another customer or login already uses this email.',
        ] + self::INVOICE_CODE_MESSAGES);

        // Customer and branch codes are fixed at creation, and never change when the name is edited.
        $data = $this->cleanGroup($request->only(self::INPUT_FIELDS));

        $composed = AddressFormatter::compose($data + $customer->only(AddressFormatter::FIELDS));
        if ($request->hasAny(['street', 'barangay', 'subdivision', 'block_lot']) && $composed !== null) {
            $data['address'] = $composed;
        }

        // The address dropdowns rewrite names to the official ones ("SJDM" ->
        // "San Jose Del Monte"), which is not a move, so names are compared
        // loosely, and City and Province only count for an older record with
        // no barangay: picking another city always clears the barangay.
        $same = fn ($v) => preg_replace('/\b(city of|city|barangay|brgy)\b|[^a-z0-9]/', '', mb_strtolower((string) $v));
        $fields = $customer->barangay ? ['street', 'subdivision', 'barangay'] : ['street', 'subdivision', 'barangay', 'city', 'province'];
        $addressChanged = false;
        foreach ($fields as $field) {
            if (array_key_exists($field, $data) && $same($data[$field] ?? '') !== $same($customer->$field ?? '')) {
                $addressChanged = true;
            }
        }

        // A pin Admin typed that differs from the saved one wins over geocoding.
        $manualPin = $request->filled('latitude') && $request->filled('longitude')
            && (abs((float) $request->latitude - (float) $customer->latitude) > 0.0000001
                || abs((float) $request->longitude - (float) $customer->longitude) > 0.0000001);

        if ($manualPin) {
            $data['latitude'] = (float) $request->latitude;
            $data['longitude'] = (float) $request->longitude;
        } elseif ($addressChanged && $coords = $this->geocode($data + $customer->only(self::INPUT_FIELDS))) {
            $data['latitude'] = $coords['latitude'];
            $data['longitude'] = $coords['longitude'];
        }

        $customer->update($data);

        return response()->json($customer->fresh());
    }

    // Removing a customer also disables their portal login and signs it out
    // everywhere. Receipts and delivery history are kept.
    public function destroy($id)
    {
        $customer = Customer::with('user')->findOrFail($id);

        DB::transaction(function () use ($customer) {
            $customer->delete();
            if ($customer->user) {
                $customer->user->update(['is_active' => false]);
                $customer->user->tokens()->delete();
            }
        });

        return response()->json(['message' => 'Customer deleted.']);
    }

    // Looks up the map pin from the separate address fields.
    private function geocode(array $data): ?array
    {
        $street = implode(', ', array_filter([
            trim((string) ($data['street'] ?? '')),
            trim((string) ($data['subdivision'] ?? '')),
        ]));

        return GeocodingService::geocode(
            $street,
            (string) ($data['city'] ?? ''),
            (string) ($data['province'] ?? ''),
            (string) ($data['barangay'] ?? '')
        );
    }

    // Customer code and branch code, built from the business name and city, in the
    // same pattern as the existing records: CUST-ALF-001 and ALF-SJDM-001.
    //   prefix: first 3 letters of the first word of the name
    //   area:   initials of a multi-word city (San Jose del Monte -> SJDM),
    //           or the first 3 letters of a one-word city
    // The number is the highest existing one for that prefix plus 1.
    private function generateCodes(string $name, string $city): array
    {
        $firstWord = preg_split('/\s+/', trim($name))[0] ?? '';
        $prefix = Str::upper(substr(preg_replace('/[^A-Za-z0-9]/', '', $firstWord), 0, 3)) ?: 'CUS';

        $cityWords = preg_split('/\s+/', trim($city), -1, PREG_SPLIT_NO_EMPTY);
        if (count($cityWords) > 1) {
            $area = Str::upper(implode('', array_map(
                fn ($w) => substr(preg_replace('/[^A-Za-z]/', '', $w), 0, 1),
                $cityWords
            )));
        } else {
            $area = Str::upper(substr(preg_replace('/[^A-Za-z]/', '', $city), 0, 3));
        }
        $area = $area ?: 'GEN';

        return [
            'customer_code' => $this->nextCode('customer_code', "CUST-{$prefix}-"),
            'branch_code' => $this->nextCode('branch_code', "{$prefix}-{$area}-"),
        ];
    }

    // Soft-deleted customers are included so a code is never reused.
    private function nextCode(string $column, string $stem): string
    {
        $highest = 0;

        Customer::withTrashed()
            ->where($column, 'like', $stem.'%')
            ->pluck($column)
            ->each(function ($code) use ($stem, &$highest) {
                if (preg_match('/^'.preg_quote($stem, '/').'(\d+)$/', $code, $m)) {
                    $highest = max($highest, (int) $m[1]);
                }
            });

        return $stem.str_pad($highest + 1, 3, '0', STR_PAD_LEFT);
    }

    // Fields a customer must have before Create Login (the same ones Add Customer
    // requires). The frontend disables the button until they are filled.
    public const LOGIN_REQUIRED = [
        'email' => 'email', 'contact_person' => 'contact person', 'contact_number' => 'contact number',
        'street' => 'street', 'barangay' => 'barangay', 'city' => 'city', 'province' => 'province',
    ];

    // Creates a Customer Portal login for an OLD customer that has none. New
    // customers get their login when they are created. The login is the
    // customer's own contact email, which must be an existing account
    // (ExistingMailbox) and not used by another login, the same as Add Customer.
    public function createAccount($id)
    {
        $customer = Customer::findOrFail($id);

        if ($customer->user_id) {
            return response()->json(['message' => 'This customer already has a login account.'], 422);
        }

        $missing = array_values(array_filter(self::LOGIN_REQUIRED, fn ($label, $field) => trim((string) $customer->$field) === '', ARRAY_FILTER_USE_BOTH));
        if ($missing) {
            return response()->json([
                'message' => 'Fill in the '.implode(', ', $missing).' on Edit Customer first.',
                'errors' => ['customer' => $missing],
            ], 422);
        }

        validator(['email' => $customer->email], [
            'email' => ['bail', 'required', 'email:rfc,filter,dns', 'max:255', 'unique:users,email', new ExistingMailbox],
        ], [
            'email.unique' => 'That email already has a login account. Change the contact email on Edit Customer.',
            'email.email' => 'The contact email is not a valid email. Change it on Edit Customer.',
        ])->validate();

        $loginEmail = $customer->email;
        $plainPassword = Str::random(10);

        $user = User::create([
            'name' => $customer->name,
            'email' => $loginEmail,
            'password' => $plainPassword,
            'role' => 'customer',
            'must_change_password' => true,
        ]);

        $customer->update(['user_id' => $user->id]);

        $emailed = $this->sendCredentials($customer->name, $loginEmail, $plainPassword);

        return response()->json([
            'message' => 'Login account created.',
            'email' => $loginEmail,
            'password' => $plainPassword,
            'emailed' => $emailed,
        ], 201);
    }

    // Emails the new login and one-time password to the customer: "sent",
    // "off" (MAIL_MAILER is log/array, so nothing really leaves the server) or
    // "failed". A mail failure never undoes the account: Admin still sees the
    // details once.
    private function sendCredentials(string $name, string $email, string $password): string
    {
        if (in_array(config('mail.default'), ['log', 'array'], true)) {
            Log::info("Customer login email to {$email} not sent: MAIL_MAILER is ".config('mail.default'));

            return 'off';
        }
        try {
            Mail::to($email)->send(new AccountCredentials($name, $email, $password));

            return 'sent';
        } catch (Throwable $e) {
            Log::warning("Customer login email to {$email} failed: ".$e->getMessage());

            return 'failed';
        }
    }
}
