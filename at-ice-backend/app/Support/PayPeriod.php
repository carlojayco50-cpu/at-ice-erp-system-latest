<?php

namespace App\Support;

use Carbon\CarbonImmutable;

// The pay period (cutoff) a date falls in: fixed blocks of `payroll.cutoff_days`
// days counted from `payroll.anchor` (Settings). Dates only (Y-m-d), no time
// of day, so there is no timezone off-by-one. Any date works, past or future:
// 2026-10-14 -> 2026-10-12 to 2026-10-25.
//
// Same rule as the frontend (src/lib/payPeriod.js). Switching to semi-monthly
// cutoffs later only needs a new version of this class and its settings.
class PayPeriod
{
    // ['start' => Y-m-d, 'end' => Y-m-d, 'pay_day' => Y-m-d]
    public static function for(string $date, ?string $anchor = null, ?int $days = null): array
    {
        $anchor ??= (string) Settings::get('payroll.anchor');
        $days ??= (int) Settings::get('payroll.cutoff_days');

        $d = self::day($date);
        $a = self::day($anchor);
        $diff = (int) $a->diffInDays($d, false);
        $offset = (($diff % $days) + $days) % $days;
        $start = $d->subDays($offset);

        return [
            'start' => $start->toDateString(),
            'end' => $start->addDays($days - 1)->toDateString(),
            'pay_day' => $start->addDays($days - 1 + (int) Settings::get('payroll.payday_offset_days'))->toDateString(),
        ];
    }

    // The period just before the one a date falls in.
    public static function previous(string $date): array
    {
        return self::for(self::day(self::for($date)['start'])->subDay()->toDateString());
    }

    // Pay days that fall in a calendar month, in order (2 or 3 for bi-weekly).
    public static function payDaysInMonth(int $year, int $month): array
    {
        $first = CarbonImmutable::create($year, $month, 1);
        $last = $first->endOfMonth()->startOfDay();
        $days = (int) Settings::get('payroll.cutoff_days');
        $offset = (int) Settings::get('payroll.payday_offset_days');

        // The period whose pay day is the first one on or after the 1st.
        $p = self::for($first->subDays($days - 1 + $offset)->toDateString());
        $list = [];
        for ($i = 0; $i < 6; $i++) {
            $pay = self::day($p['pay_day']);
            if ($pay->greaterThan($last)) {
                break;
            }
            if ($pay->greaterThanOrEqualTo($first)) {
                $list[] = $p['pay_day'];
            }
            $p = self::for(self::day($p['end'])->addDay()->toDateString());
        }

        return $list;
    }

    // 1 for the first pay day of its month, 2 for the second, 3 for a third.
    public static function payDayNumber(string $payDay): int
    {
        $d = self::day($payDay);
        $index = array_search($d->toDateString(), self::payDaysInMonth($d->year, $d->month), true);

        return $index === false ? 0 : $index + 1;
    }

    private static function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', substr($date, 0, 10), 'UTC');
    }
}
