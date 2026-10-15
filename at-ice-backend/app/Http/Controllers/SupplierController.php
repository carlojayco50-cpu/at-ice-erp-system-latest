<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use App\Services\AddressFormatter;
use App\Services\PhoneFormatter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    // Stored as +63 and 9 to 10 digits: mobile (+639171234567), or a landline with
    // area code (+63281234567 Metro Manila, +63441234567 provincial).
    private const PHONE_REGEX = PhoneFormatter::ANY_REGEX;

    private const PHONE_MESSAGE = PhoneFormatter::ANY_MESSAGE;

    private function cleanPhone(Request $request): void
    {
        if ($request->filled('contact_number')) {
            $request->merge(['contact_number' => PhoneFormatter::normalize((string) $request->contact_number)]);
        }
    }

    // Next free code in the format SPL-0001, SPL-0002, ...
    private function nextSupplierCode(): string
    {
        $n = (Supplier::max('id') ?? 0) + 1;
        do {
            $code = 'SPL-'.str_pad($n, 4, '0', STR_PAD_LEFT);
            $n++;
        } while (Supplier::where('supplier_code', $code)->exists());

        return $code;
    }

    private function rules(?Supplier $supplier = null): array
    {
        return [
            'name' => ['required', 'string', 'max:255', Rule::unique('suppliers', 'name')->ignore($supplier?->id)],
            'contact_person' => 'nullable|string|max:255',
            'contact_number' => ['nullable', 'regex:'.self::PHONE_REGEX],
            'email' => 'nullable|email:rfc,filter,dns|max:255',
            'address' => 'nullable|string|max:500',
            'barangay' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'province' => 'nullable|string|max:100',
            ...AddressFormatter::PSGC_RULES,
            'notes' => 'nullable|string|max:1000',
        ];
    }

    private function messages(): array
    {
        return [
            'name.unique' => 'A supplier with this name already exists.',
            'contact_number.regex' => self::PHONE_MESSAGE,
        ];
    }

    public function index()
    {
        return response()->json(Supplier::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $this->cleanPhone($request);

        $data = $request->validate(
            $this->rules() + ['supplier_code' => 'nullable|string|max:50|unique:suppliers,supplier_code'],
            $this->messages()
        );

        if (empty($data['supplier_code'])) {
            $data['supplier_code'] = $this->nextSupplierCode();
        }

        $supplier = Supplier::create($data);

        return response()->json($supplier, 201);
    }

    public function show($id)
    {
        return response()->json(Supplier::findOrFail($id));
    }

    // Only the listed fields can be changed. The supplier code stays fixed.
    public function update(Request $request, $id)
    {
        $supplier = Supplier::findOrFail($id);

        $this->cleanPhone($request);

        $data = $request->validate($this->rules($supplier), $this->messages());

        $supplier->update($data);

        return response()->json($supplier->fresh());
    }

    public function destroy($id)
    {
        Supplier::findOrFail($id)->delete();

        return response()->json(['message' => 'Supplier deleted']);
    }
}
