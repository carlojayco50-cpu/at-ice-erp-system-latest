<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KioskToken extends Model
{
    // An unlocked kiosk stays unlocked for 30 days, renewed each time it is used.
    public const LIFETIME_DAYS = 30;

    protected $fillable = ['token_hash', 'pin_version', 'expires_at', 'last_used_at', 'created_ip'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'last_used_at' => 'datetime'];
    }

    public static function hash(string $plainToken): string
    {
        return hash('sha256', $plainToken);
    }
}
