<?php

namespace App\Support;

// Money: amounts are computed at full precision and only the final amount is
// rounded to centavos (half up). Stored as DECIMAL(10,2), never FLOAT.
class Money
{
    public static function round(float|int|string $amount): float
    {
        $a = (float) $amount;

        // A tiny nudge so values like 1.005 (stored as 1.00499999...) round up.
        return round($a + ($a >= 0 ? 1e-9 : -1e-9), 2, PHP_ROUND_HALF_UP);
    }

    // "1234.5" -> "1,234.50"
    public static function format(float|int|string $amount): string
    {
        return number_format(self::round($amount), 2);
    }
}
