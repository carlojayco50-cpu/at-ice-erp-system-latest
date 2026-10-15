<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

// Philippine holidays for 2026, from Proclamation No. 1006 (s. 2025) and
// Proclamation No. 1189 (s. 2026, Eid'l Fitr). VERIFY AGAINST THE LATEST
// PROCLAMATION: Eid'l Adha is declared separately (not out yet when this was
// written), and holidays can be added on short notice. Add or change them in
// HRIS > Holidays; dates already in the table are left as they are.
//
//   php artisan db:seed --class=HolidaySeeder
class HolidaySeeder extends Seeder
{
    public const YEAR = 2026;

    public const HOLIDAYS = [
        // Regular holidays
        ['2026-01-01', "New Year's Day", 'REGULAR'],
        ['2026-03-20', "Eid'l Fitr", 'REGULAR'],
        ['2026-04-02', 'Maundy Thursday', 'REGULAR'],
        ['2026-04-03', 'Good Friday', 'REGULAR'],
        ['2026-04-09', 'Araw ng Kagitingan', 'REGULAR'],
        ['2026-05-01', 'Labor Day', 'REGULAR'],
        ['2026-06-12', 'Independence Day', 'REGULAR'],
        ['2026-08-31', 'National Heroes Day', 'REGULAR'],
        ['2026-11-30', 'Bonifacio Day', 'REGULAR'],
        ['2026-12-25', 'Christmas Day', 'REGULAR'],
        ['2026-12-30', 'Rizal Day', 'REGULAR'],
        // Special (non-working) days
        ['2026-02-17', 'Chinese New Year', 'SPECIAL_NON_WORKING'],
        ['2026-04-04', 'Black Saturday', 'SPECIAL_NON_WORKING'],
        ['2026-08-21', 'Ninoy Aquino Day', 'SPECIAL_NON_WORKING'],
        ['2026-11-01', "All Saints' Day", 'SPECIAL_NON_WORKING'],
        ['2026-11-02', "All Souls' Day", 'SPECIAL_NON_WORKING'],
        ['2026-12-08', 'Feast of the Immaculate Conception of Mary', 'SPECIAL_NON_WORKING'],
        ['2026-12-24', 'Christmas Eve', 'SPECIAL_NON_WORKING'],
        ['2026-12-31', 'Last Day of the Year', 'SPECIAL_NON_WORKING'],
        // Special working day
        ['2026-02-25', 'EDSA People Power Revolution Anniversary', 'SPECIAL_WORKING'],
    ];

    public function run(): void
    {
        $now = now();
        foreach (self::HOLIDAYS as [$date, $name, $type]) {
            DB::table('holidays')->insertOrIgnore([
                'date' => $date, 'name' => $name, 'type' => $type, 'year' => self::YEAR,
                'is_double' => false, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }
}
