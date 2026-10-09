<?php

namespace App\Services;

class AddressFormatter
{
    // Street-level address fields. City and province are separate columns.
    public const FIELDS = ['block_lot', 'street', 'subdivision', 'barangay', 'postal_code'];

    // Builds the legacy one-line `address` from the separate fields, e.g.
    // "Blk 5 Lot 2, Rizal St, Sunrise Subd., Brgy. Muzon". Returns null when
    // none of them is filled, so an old free-text address is left alone.
    public static function compose(array $parts): ?string
    {
        $barangay = trim((string) ($parts['barangay'] ?? ''));

        $line = array_filter([
            trim((string) ($parts['block_lot'] ?? '')),
            trim((string) ($parts['street'] ?? '')),
            trim((string) ($parts['subdivision'] ?? '')),
            $barangay !== '' ? 'Brgy. '.$barangay : '',
        ], fn ($part) => $part !== '');

        return $line ? implode(', ', $line) : null;
    }
}
