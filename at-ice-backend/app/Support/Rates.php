<?php

namespace App\Support;

// Pay rates. Employees are paid by the day (daily_rate) or by the month
// (monthly_rate); both are turned into the same daily, hourly and per-minute
// rates. The daily and hourly rates are rounded to centavos, as on a rate
// card (16,000 a month -> 732.94 a day -> 91.62 an hour); the per-minute rate
// is kept at full precision.
class Rates
{
    public static function dailyFromMonthly(float $monthly): float
    {
        return Money::round($monthly / (float) Settings::get('payroll.monthly_to_daily_divisor'));
    }

    public static function hourly(float $daily): float
    {
        return Money::round($daily / (float) Settings::get('payroll.hours_per_day'));
    }

    public static function perMinute(float $daily): float
    {
        return self::hourly($daily) / 60;
    }

    // An employee's daily rate, whatever their pay basis.
    public static function dailyFor(?string $payBasis, ?float $dailyRate, ?float $monthlyRate): float
    {
        return $payBasis === 'monthly' && $monthlyRate
            ? self::dailyFromMonthly($monthlyRate)
            : Money::round((float) $dailyRate);
    }
}
