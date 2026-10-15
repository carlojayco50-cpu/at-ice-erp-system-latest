<?php

namespace App\Http\Controllers;

use App\Services\DriverLicense;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

// Reads a resume or CV, or a Driver's license, that HR uploads on Add Employee
// or Add Applicant, to fill in the form: the person's name, mobile number,
// email, home address and driver's license number and expiry.
//   kind "resume":  a PDF or Word file. The browser sends its text; a scanned
//                   PDF with no text in it is sent as a picture of its first page.
//   kind "license": a photo or PDF of the LTO driver's license (Drivers only).
// The model also says what kind of document it is, and a file of the wrong kind
// is turned down (an ID on the resume zone, anything but a driver's license on
// the license zone). Nothing is stored. The address names are matched to the
// PSGC dropdowns by the frontend (src/lib/psgc.js).
class DocumentScanController extends Controller
{
    // Groq accepts base64 images up to 4 MB.
    private const MAX_IMAGE_CHARS = 4 * 1024 * 1024;

    // Resume text sent to the model (characters; a resume is rarely longer).
    private const MAX_TEXT = 12000;

    private const ADDRESS_FIELDS = ['block_lot', 'street', 'subdivision', 'barangay', 'city', 'province', 'postal_code'];

    private const NAME_FIELDS = ['first_name', 'middle_name', 'last_name', 'suffix'];

    private const DOCUMENT_TYPES = ['resume', 'drivers_license', 'other_id', 'other'];

    // Same list as the frontend (src/lib/names.js)
    private const SUFFIXES = ['JR' => 'Jr.', 'SR' => 'Sr.', 'II' => 'II', 'III' => 'III', 'IV' => 'IV', 'V' => 'V'];

    private const PROMPT = <<<'TXT'
        The document is a resume, CV, or Philippine ID such as an LTO driver's license.
        Read the details of the person it belongs to (not an employer, school or reference).
        Reply with JSON only, in this shape:
        {"document_type": "", "first_name": "", "middle_name": "", "last_name": "", "suffix": "", "mobile": "", "email": "",
         "license_number": "", "license_expiry": "",
         "block_lot": "", "street": "", "subdivision": "", "barangay": "", "city": "", "province": "", "postal_code": ""}
        - document_type: "resume" for a resume, CV or bio-data; "drivers_license" for a Philippine LTO driver's license;
          "other_id" for any other ID card; "other" for anything else
        - first_name: given name(s), e.g. "Juan Carlo"
        - middle_name: middle name (or just the initial if only that is shown)
        - last_name: surname, e.g. "Dela Cruz". On a license the name is "LAST, FIRST MIDDLE".
        - suffix: "Jr.", "Sr.", "II", "III" or "" if none
        - mobile: the person's own mobile number, digits as written (e.g. "0917 123 4567" or "+63 917 123 4567");
          not a landline and not a reference's number
        - email: the person's email address
        - license_number: driver's license number (e.g. "N01-23-456789"), only on a driver's license
        - license_expiry: the license's expiration date as YYYY-MM-DD, only on a driver's license
        - block_lot: house number, or block and lot (e.g. "Blk 5 Lot 12", "123")
        - street: street name only (e.g. "Rizal St")
        - subdivision: subdivision, village or phase, if any
        - barangay: barangay name without the word "Barangay" or "Brgy." (e.g. "Muzon", "179")
        - city: city or municipality (e.g. "San Jose del Monte", "Caloocan City")
        - province: province, or "Metro Manila" for NCR
        - postal_code: 4-digit ZIP code, if shown
        Copy the text as written; leave a field "" when it is not in the document. Do not guess.
        TXT;

    public function scan(Request $request)
    {
        // The model can take a while; PHP's default 30 seconds is too short.
        set_time_limit(75);

        $request->validate([
            'kind' => 'required|in:resume,license',
            'image' => ['nullable', 'required_without:text', 'string', 'max:'.self::MAX_IMAGE_CHARS, 'regex:/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/'],
            'text' => ['nullable', 'required_without:image', 'string', 'min:20', 'max:'.(self::MAX_TEXT * 4)],
        ], [
            'kind.required' => "Choose a resume or a driver's license to scan.",
            'kind.in' => "Choose a resume or a driver's license to scan.",
            'image.max' => 'The picture is too large. Use a smaller or clearer picture.',
            'image.regex' => 'Upload a picture (JPG, PNG) or a PDF.',
            'image.required_without' => 'Upload a file to scan.',
            'text.required_without' => 'Upload a file to scan.',
            'text.min' => 'No text was found in this file. Use a PDF or Word resume with text in it.',
            'text.max' => 'This file is too long to be a resume.',
        ]);

        $kind = $request->kind;
        if ($kind === 'license' && ! $request->filled('image')) {
            return response()->json(['message' => "Upload a photo or PDF of the driver's license."], 422);
        }

        $apiKey = config('services.groq.key');
        if (! $apiKey) {
            return response()->json(['message' => 'Document scanning is not set up yet (GROQ_API_KEY is missing).'], 503);
        }

        // Text goes to the text model (cheaper and faster), a picture to the vision model.
        $text = $request->filled('image') ? null : mb_substr((string) $request->text, 0, self::MAX_TEXT);

        try {
            $http = Http::connectTimeout(10)->timeout(60)->withHeaders(['Authorization' => "Bearer {$apiKey}"]);
            // Same as BiController: SSL is skipped only on the local machine.
            if (app()->environment('local')) {
                $http = $http->withoutVerifying();
            }

            $response = $http->post('https://api.groq.com/openai/v1/chat/completions', [
                'model' => $text !== null ? config('services.groq.text_model') : config('services.groq.vision_model'),
                'messages' => [[
                    'role' => 'user',
                    'content' => $text !== null
                        ? self::PROMPT."\n\nThe document's text:\n<<<\n".$text."\n>>>"
                        : [
                            ['type' => 'text', 'text' => self::PROMPT],
                            ['type' => 'image_url', 'image_url' => ['url' => $request->image]],
                        ],
                ]],
                'response_format' => ['type' => 'json_object'],
                'temperature' => 0,
                'max_tokens' => 700,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Groq document scan failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'The document could not be read right now. Try again.'], 502);
        }

        // Groq's free tier allows only a few scans a minute.
        if ($response->status() === 429) {
            preg_match('/try again in ([0-9.]+)s/i', (string) $response->json('error.message'), $wait);
            $seconds = isset($wait[1]) ? (int) ceil((float) $wait[1]) : 30;

            return response()->json(['message' => "Too many scans in the last minute. Try again in {$seconds} seconds."], 429)
                ->header('Retry-After', (string) $seconds);
        }

        if ($response->failed()) {
            // Details go to the server log only, never to the browser
            Log::warning('Groq document scan returned an error', ['status' => $response->status(), 'body' => $response->json()]);

            return response()->json(['message' => 'The document could not be read right now. Try again.'], 502);
        }

        $result = $this->parse((string) $response->json('choices.0.message.content'), $text);
        $type = $result['document_type'];
        unset($result['document_type']);

        // Only a driver's license on the license zone, and no ID on the resume zone.
        if ($kind === 'license') {
            if ($type !== 'drivers_license') {
                return response()->json(['message' => "This is not a driver's license. Upload a clear photo of the LTO driver's license."], 422);
            }
            if (($result['person']['license_number'] ?? '') === '') {
                return response()->json(['message' => 'The license number could not be read. Use a clearer, straight photo of the license.'], 422);
            }
            // The license fills the name and license details; the address comes from the resume.
            $result['address'] = null;
        } elseif (in_array($type, ['drivers_license', 'other_id'], true)) {
            return response()->json(['message' => 'This looks like an ID, not a resume. Upload the resume or CV here (PDF or Word).'], 422);
        } elseif ($result['person']) {
            // A resume does not fill the license fields.
            $result['person']['license_number'] = '';
            $result['person']['license_expiry'] = '';
        }

        if (! $result['person'] && ! $result['address']) {
            return response()->json(['message' => 'No name or address was found in this document. Fill in the form by hand.'], 422);
        }

        return response()->json($result);
    }

    // The model's JSON reply as clean form values:
    // { document_type, person: {first_name, middle_initial, last_name, suffix, phone, email,
    //   license_number, license_expiry} | null, address: {...} | null }
    private function parse(string $reply, ?string $sourceText = null): array
    {
        $empty = ['document_type' => '', 'person' => null, 'address' => null];
        // JSON mode returns plain JSON; the first {...} is taken in case of extra text.
        if (! preg_match('/\{.*\}/s', $reply, $m)) {
            return $empty;
        }
        $data = json_decode($m[0], true);
        if (! is_array($data)) {
            return $empty;
        }
        $get = fn (string $k) => is_string($data[$k] ?? null) ? mb_substr(trim(preg_replace('/\s+/', ' ', $data[$k])), 0, 255) : '';

        $name = [];
        foreach (self::NAME_FIELDS as $field) {
            $name[$field] = self::properCase($get($field));
        }
        $suffix = strtoupper(rtrim($name['suffix'], '.'));
        $email = strtolower($get('email'));

        $person = [
            'first_name' => $name['first_name'],
            'middle_initial' => mb_strtoupper(mb_substr(preg_replace('/[^\pL]/u', '', $name['middle_name']), 0, 1)),
            'last_name' => $name['last_name'],
            'suffix' => self::SUFFIXES[$suffix] ?? '',
            // The model's number, or else the first mobile number in the resume's text.
            'phone' => self::mobile($get('mobile')) ?: self::mobileIn((string) $sourceText),
            'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '',
            'license_number' => '',
            'license_expiry' => '',
        ];
        $license = DriverLicense::normalize($get('license_number'));
        if ($license && preg_match(DriverLicense::REGEX, $license)) {
            $person['license_number'] = $license;
            $person['license_expiry'] = DriverLicense::date($get('license_expiry'));
        }

        $address = [];
        foreach (self::ADDRESS_FIELDS as $field) {
            $address[$field] = $field === 'postal_code' ? $get($field) : self::properCase($get($field));
        }
        $address['barangay'] = trim(preg_replace('/^(barangay|brgy\.?|bgy\.?)\s+/i', '', $address['barangay']));
        if (! preg_match('/^\d{4}$/', $address['postal_code'])) {
            $address['postal_code'] = '';
        }
        // An address is only useful with at least a city or a province.
        $address = $address['city'] !== '' || $address['province'] !== '' ? $address : null;

        $hasPerson = $person['first_name'] !== '' || $person['last_name'] !== '' || $person['license_number'] !== '';
        $type = $get('document_type');

        return [
            'document_type' => in_array($type, self::DOCUMENT_TYPES, true) ? $type : '',
            'person' => $hasPerson ? $person : null,
            'address' => $address,
        ];
    }

    // IDs print in capitals: "DELA CRUZ" -> "Dela Cruz", "RIZAL ST." -> "Rizal St.".
    // Text already in mixed case is kept as written; roman numerals stay upper case.
    private static function properCase(string $s): string
    {
        if ($s === '' || preg_match('/\p{Ll}/u', $s)) {
            return $s;
        }
        $s = mb_convert_case(mb_strtolower($s), MB_CASE_TITLE);

        return preg_replace_callback('/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii|Xiii)\b/', fn ($m) => strtoupper($m[1]), $s);
    }

    // A Philippine mobile number as the form's 10 digits ("9171234567"), or "".
    // 0917 123 4567, +63 917 123 4567, +63 (0) 917 123 4567 and 63-917-123-4567
    // are the same number: the leading 0 and the +63 both stand for the country code.
    private static function mobile(string $s): string
    {
        $digits = preg_replace('/\D/', '', $s);
        if (preg_match('/^(?:630|63|0)?(9\d{9})$/', $digits, $m)) {
            return $m[1];
        }

        return '';
    }

    // The first mobile number written anywhere in a resume's text.
    private static function mobileIn(string $text): string
    {
        $pattern = '/(?<!\d)(?:\+?63[\s.\-]*(?:\(0\)[\s.\-]*)?|0)9\d{2}[\s.\-]*\d{3}[\s.\-]*\d{4}(?!\d)/';

        return preg_match($pattern, $text, $m) ? self::mobile($m[0]) : '';
    }
}
