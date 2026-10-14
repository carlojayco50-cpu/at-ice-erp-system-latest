<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Holiday and overtime pay rates (R3), each with the date it takes effect. A
// change is a new row, so older payrolls keep the rate of their day. Seeded
// with the client's defaults; the note keeps the DOLE value.
class PayMultiplier extends Model
{
    public const KEYS = [
        'REGULAR_HOLIDAY_WORKED', 'REGULAR_HOLIDAY_UNWORKED', 'SPECIAL_HOLIDAY_WORKED', 'SPECIAL_HOLIDAY_UNWORKED',
        'SPECIAL_WORKING_DAY_WORKED', 'OT_ORDINARY', 'OT_SPECIAL_HOLIDAY', 'OT_REGULAR_HOLIDAY',
        'REGULAR_HOLIDAY_REST_DAY', 'DOUBLE_HOLIDAY',
    ];

    protected $fillable = ['key', 'value', 'effective_date', 'note', 'created_by'];

    protected $casts = [
        'value' => 'decimal:2',
        'effective_date' => 'date:Y-m-d',
    ];

    private static array $memo = [];

    // The rate for a key in effect on a date (1.0 if none is set).
    public static function rate(string $key, string $date): float
    {
        return self::$memo["{$key}@{$date}"] ??= (float) (static::where('key', $key)
            ->whereDate('effective_date', '<=', $date)
            ->orderByDesc('effective_date')
            ->value('value') ?? 1.0);
    }

    public static function forget(): void
    {
        self::$memo = [];
    }

    protected static function booted(): void
    {
        static::saved(fn () => self::forget());
    }
}
