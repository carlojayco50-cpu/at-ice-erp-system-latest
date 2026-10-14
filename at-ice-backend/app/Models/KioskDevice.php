<?php

namespace App\Models;

use App\Support\Settings;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

// One Attendance Station computer, known by the random kiosk ID its browser
// keeps. After kiosk.max_wrong_pins wrong HR PINs in a row the kiosk is locked
// with no time limit; only the Admin override PIN, typed on that kiosk,
// unlocks it (HR cannot). Every attempt is logged in kiosk_attempts.
class KioskDevice extends Model
{
    protected $fillable = ['device_id', 'failed_attempts', 'locked_at', 'last_seen_at', 'last_ip'];

    protected $casts = [
        'locked_at' => 'datetime',
        'last_seen_at' => 'datetime',
    ];

    public static function for(string $deviceId, ?string $ip): self
    {
        $device = static::firstOrCreate(['device_id' => $deviceId]);
        $device->forceFill(['last_seen_at' => now(), 'last_ip' => $ip])->save();

        return $device;
    }

    public function isLocked(): bool
    {
        return $this->locked_at !== null;
    }

    public function attemptsLeft(): int
    {
        return max(0, (int) Settings::get('kiosk.max_wrong_pins') - $this->failed_attempts);
    }

    // A wrong HR PIN. Returns true when this one locked the kiosk.
    public function wrongPin(?string $ip): bool
    {
        $this->increment('failed_attempts');
        $this->log('wrong_pin', $ip);
        if ($this->attemptsLeft() > 0) {
            return false;
        }
        $this->forceFill(['locked_at' => now()])->save();
        $this->log('locked', $ip);

        return true;
    }

    public function unlocked(?string $ip): void
    {
        $this->forceFill(['failed_attempts' => 0])->save();
        $this->log('unlocked', $ip);
    }

    public function log(string $result, ?string $ip): void
    {
        DB::table('kiosk_attempts')->insert([
            'kiosk_device_id' => $this->id,
            'result' => $result,
            'ip' => $ip,
            'created_at' => now(),
        ]);
    }
}
