<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// SSS, PhilHealth, Pag-IBIG and withholding tax rules, each with the date it
// takes effect. A payroll uses the rules in effect on its pay day.
class ContributionRate extends Model
{
    public const TYPES = ['sss', 'philhealth', 'pagibig', 'tax'];

    protected $fillable = ['type', 'effective_from', 'rules', 'note'];

    protected $casts = [
        'effective_from' => 'date:Y-m-d',
        'rules' => 'array',
    ];

    // The rules for a type in effect on a date, or null if there are none.
    public static function rulesOn(string $type, string $date): ?array
    {
        return static::where('type', $type)
            ->whereDate('effective_from', '<=', $date)
            ->orderByDesc('effective_from')
            ->value('rules');
    }
}
