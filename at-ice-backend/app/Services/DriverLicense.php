<?php

namespace App\Services;

use Carbon\Carbon;

// Philippine (LTO) driver's license number: a letter and 10 digits, written
// N01-23-456789. Required for Drivers (EmployeeController) and read from a
// scanned license (DocumentScanController).
//
// The parts, as LTO issues them:
//   N01  the LTO office that issued it: a region letter (e.g. N = NCR) and a
//        two-digit office number (01 to 99, never 00)
//   23   the year the license was first issued (2023)
//   456789  the serial number (never 000000)
// A Driver also needs the license's expiry date: a license that has expired
// is not accepted, and LTO licenses are valid for at most 10 years.
class DriverLicense
{
    public const REGEX = '/^[A-Z](?!00)\d{2}-\d{2}-(?!000000)\d{6}$/';

    public const MESSAGE = "Enter the driver's license number as on the card: a letter and 10 digits, e.g. N01-23-456789.";

    public const MAX_VALID_YEARS = 10;

    // "n01 23 456789" or "N0123456789" -> "N01-23-456789". Anything else is
    // returned as typed (trimmed, upper case) so validation can say what is wrong.
    public static function normalize(?string $value): ?string
    {
        $value = strtoupper(trim((string) $value));
        if ($value === '') {
            return null;
        }
        $compact = preg_replace('/[\s\-.]/', '', $value);
        // A scanned "O" in the office number is the digit zero (N0l -> N01 is not guessed).
        if (preg_match('/^([A-Z])([0-9O]{2})(\d{2})(\d{6})$/', $compact, $m)) {
            return $m[1].str_replace('O', '0', $m[2])."-{$m[3]}-{$m[4]}";
        }

        return $value;
    }

    // Validation rules for the expiry date (Y-m-d), required for Drivers.
    public static function expiryRules(bool $required): array
    {
        return [
            $required ? 'required' : 'nullable',
            'date',
            'after:'.now(config('atice.timezone'))->toDateString(),
            'before_or_equal:'.now(config('atice.timezone'))->addYears(self::MAX_VALID_YEARS)->toDateString(),
        ];
    }

    public const EXPIRY_MESSAGES = [
        'license_expiry.required' => "Enter the license's expiry date.",
        'license_expiry.date' => "Enter the license's expiry date.",
        'license_expiry.after' => 'This license has expired. A Driver needs a valid license.',
        'license_expiry.before_or_equal' => 'Check the expiry date: an LTO license is valid for at most 10 years.',
    ];

    // A date read from a license ("2028-05-17", "05/17/2028", "2028/05/17") as Y-m-d, or "".
    public static function date(?string $value): string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '';
        }
        foreach (['Y-m-d', 'Y/m/d', 'm/d/Y', 'm-d-Y', 'Y.m.d'] as $format) {
            try {
                $d = Carbon::createFromFormat('!'.$format, $value);
                if ($d && $d->format($format) === $value) {
                    return $d->toDateString();
                }
            } catch (\Throwable) {
                // try the next format
            }
        }

        return '';
    }
}
