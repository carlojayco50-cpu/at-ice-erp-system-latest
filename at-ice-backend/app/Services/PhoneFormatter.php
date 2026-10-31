<?php

namespace App\Services;

// Philippine phone numbers are stored with the +63 prefix and no leading 0,
// e.g. +639171234567.
class PhoneFormatter
{
    // Mobile only: 9 followed by 9 more digits (employees, applicants).
    public const MOBILE_REGEX = '/^\+639\d{9}$/';

    public const MOBILE_MESSAGE = 'Phone must be +63 followed by 10 digits starting with 9 (e.g. +639171234567).';

    // Mobile or landline with area code: 9 to 10 digits after +63 (customers, suppliers).
    public const ANY_REGEX = '/^\+63\d{9,10}$/';

    public const ANY_MESSAGE = 'Contact number must be +63 followed by 9 to 10 digits (mobile, or landline with area code).';

    // Strict version for mobile fields: only digits with an optional leading + are
    // accepted. Spaces, dashes and other characters are left in, so the MOBILE_REGEX
    // check fails. The 10 digits alone, 09... and 63... all become +639XXXXXXXXX.
    public static function mobile(?string $value): ?string
    {
        if ($value === null || ! preg_match('/^\+?\d+$/', $value)) {
            return $value;
        }

        $number = self::normalize($value);

        return preg_match('/^9\d{9}$/', $number) ? '+63'.$number : $number;
    }

    // Removes spaces, dashes and brackets, then turns a leading 0 (or 63) into +63.
    // Anything else is returned cleaned but otherwise as it was.
    public static function normalize(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return $value;
        }

        $clean = preg_replace('/[\s\-()]/', '', $value);

        if (str_starts_with($clean, '+63')) {
            return $clean;
        }
        if (preg_match('/^0\d/', $clean)) {
            return '+63'.substr($clean, 1);
        }
        if (preg_match('/^63\d{10,}$/', $clean)) {
            return '+'.$clean;
        }

        return $clean;
    }
}
