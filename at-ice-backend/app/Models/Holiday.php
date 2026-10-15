<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

// One holiday (HolidayController; seeded by Database\Seeders\HolidaySeeder).
// Attendance, leave and payroll always look holidays up here.
class Holiday extends Model
{
    public const TYPES = ['REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING'];

    protected $fillable = ['date', 'name', 'type', 'is_double', 'year', 'created_by'];

    protected $casts = [
        'date' => 'date:Y-m-d',
        'is_double' => 'boolean',
    ];

    protected static function booted(): void
    {
        $forget = fn () => Cache::forget('holidays-by-date');
        static::saved($forget);
        static::deleted($forget);
    }

    // Y-m-d => Holiday, for quick lookups while counting a pay period.
    public static function byDate(): array
    {
        return Cache::rememberForever('holidays-by-date', fn () => static::all()->keyBy(fn ($h) => $h->date->toDateString())->all());
    }

    public static function forDate(string $date): ?self
    {
        return self::byDate()[substr($date, 0, 10)] ?? null;
    }
}
