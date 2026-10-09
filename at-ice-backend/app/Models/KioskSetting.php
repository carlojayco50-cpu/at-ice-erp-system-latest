<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Hash;

class KioskSetting extends Model
{
    protected $fillable = ['pin_hash', 'pin_version', 'pin_changed_at', 'pin_changed_by'];

    protected function casts(): array
    {
        return ['pin_changed_at' => 'datetime'];
    }

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'pin_changed_by');
    }

    // The single settings row, created on first use.
    public static function current(): self
    {
        return static::first() ?? static::create(['pin_version' => 1]);
    }

    public function hasPin(): bool
    {
        return $this->pin_hash !== null;
    }

    public function checkPin(string $pin): bool
    {
        return $this->hasPin() && Hash::check($pin, $this->pin_hash);
    }

    // Sets or changes the PIN. The version goes up and every kiosk token is deleted,
    // so each unlocked kiosk is locked again.
    public function setPin(string $pin, ?int $userId): void
    {
        $this->update([
            'pin_hash' => Hash::make($pin),
            'pin_version' => $this->pin_version + 1,
            'pin_changed_at' => now(),
            'pin_changed_by' => $userId,
        ]);

        KioskToken::query()->delete();
    }
}
