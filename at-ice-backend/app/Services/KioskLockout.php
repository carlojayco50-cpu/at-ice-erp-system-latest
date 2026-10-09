<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

// Wrong-PIN limits for the kiosk unlock:
//   per IP:      5 wrong PINs, then locked out for 15 minutes
//   all devices: 20 wrong PINs in an hour, then everyone is locked out
// The second limit stops someone from getting around the first with many IPs.
// HR can clear every lockout from the Kiosk PIN page.
class KioskLockout
{
    private const IP_MAX = 5;

    private const IP_DECAY = 900;   // seconds

    private const GLOBAL_MAX = 20;

    private const GLOBAL_DECAY = 3600;  // seconds

    private const GLOBAL_KEY = 'kiosk-pin:global';

    private const REGISTRY_KEY = 'kiosk-pin:ips';

    private static function ipKey(string $ip): string
    {
        return 'kiosk-pin:ip:'.$ip;
    }

    // Seconds until this device may try again, or 0 when it may try now.
    public static function retryAfter(string $ip): int
    {
        $wait = 0;

        if (RateLimiter::tooManyAttempts(self::ipKey($ip), self::IP_MAX)) {
            $wait = max($wait, RateLimiter::availableIn(self::ipKey($ip)));
        }
        if (RateLimiter::tooManyAttempts(self::GLOBAL_KEY, self::GLOBAL_MAX)) {
            $wait = max($wait, RateLimiter::availableIn(self::GLOBAL_KEY));
        }

        return $wait;
    }

    public static function recordFailure(string $ip): void
    {
        RateLimiter::hit(self::ipKey($ip), self::IP_DECAY);
        RateLimiter::hit(self::GLOBAL_KEY, self::GLOBAL_DECAY);

        $ips = Cache::get(self::REGISTRY_KEY, []);
        if (! in_array($ip, $ips, true)) {
            $ips[] = $ip;
            Cache::put(self::REGISTRY_KEY, $ips, self::GLOBAL_DECAY);
        }
    }

    public static function attemptsLeft(string $ip): int
    {
        $ipLeft = self::IP_MAX - RateLimiter::attempts(self::ipKey($ip));
        $globalLeft = self::GLOBAL_MAX - RateLimiter::attempts(self::GLOBAL_KEY);

        return max(0, min($ipLeft, $globalLeft));
    }

    // A correct PIN clears that device's own failed attempts.
    public static function recordSuccess(string $ip): void
    {
        RateLimiter::clear(self::ipKey($ip));
    }

    public static function isLocked(): bool
    {
        if (RateLimiter::tooManyAttempts(self::GLOBAL_KEY, self::GLOBAL_MAX)) {
            return true;
        }

        foreach (Cache::get(self::REGISTRY_KEY, []) as $ip) {
            if (RateLimiter::tooManyAttempts(self::ipKey($ip), self::IP_MAX)) {
                return true;
            }
        }

        return false;
    }

    public static function clearAll(): void
    {
        foreach (Cache::get(self::REGISTRY_KEY, []) as $ip) {
            RateLimiter::clear(self::ipKey($ip));
        }
        RateLimiter::clear(self::GLOBAL_KEY);
        Cache::forget(self::REGISTRY_KEY);
    }
}
