<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

// Progressive sign-in lockout, kept in the cache (nothing new in the database).
//
// Three counters, all checked before the password is:
//  - email + IP: every `threshold` wrong passwords in a row lock that pair for
//    the next step (3, 5, 10, 15, 30, 60 minutes, then 60 again). The step is
//    remembered for `memory` seconds since the last failure and cleared by a
//    successful sign-in. Another person on another IP has their own pair, so
//    one stranger cannot lock an employee out of their own computer.
//  - email alone, any IP: a high count in an hour (spread-out guessing) locks
//    that email for a short fixed time.
//  - IP alone, any email: a high count in 15 minutes (one machine trying many
//    accounts) locks that IP for a short fixed time. The limit is high so a
//    shared office network is not caught by normal mistakes.
// The state is per email text, whether or not the account exists, so the replies
// never show which emails are real.
class LoginLockout
{
    private static function cfg(): array
    {
        return config('atice.login_lockout');
    }

    private static function emailHash(string $email): string
    {
        return sha1(mb_strtolower(trim($email)));
    }

    private static function pairKey(string $email, string $ip): string
    {
        return 'login-lock:pair:'.self::emailHash($email).':'.$ip;
    }

    private static function accountKey(string $email): string
    {
        return 'login-lock:account:'.self::emailHash($email);
    }

    private static function ipKey(string $ip): string
    {
        return 'login-lock:ip:'.$ip;
    }

    // Lockout length for the nth lockout in a row (1 = first), capped at the last step.
    public static function stepSeconds(int $strikes): int
    {
        $steps = self::cfg()['steps'];

        return $steps[min(max($strikes, 1), count($steps)) - 1];
    }

    // Seconds left on the longest lock that applies to this email and IP; 0 = free to try.
    public static function secondsLeft(string $email, string $ip): int
    {
        $until = max(
            (int) (Cache::get(self::pairKey($email, $ip))['until'] ?? 0),
            (int) (Cache::get(self::accountKey($email))['until'] ?? 0),
            (int) (Cache::get(self::ipKey($ip))['until'] ?? 0),
        );

        return max(0, $until - now()->timestamp);
    }

    // Counts one wrong password. Returns the seconds the sign-in is now locked for (0 = not locked).
    public static function recordFailure(string $email, string $ip): int
    {
        $cfg = self::cfg();
        $now = now()->timestamp;

        // email + IP: progressive
        $pairKey = self::pairKey($email, $ip);
        $pair = Cache::get($pairKey, ['fails' => 0, 'strikes' => 0, 'until' => 0]);
        $pair['fails']++;
        if ($pair['fails'] >= $cfg['threshold']) {
            $pair['fails'] = 0;
            $pair['strikes']++;
            $pair['until'] = $now + self::stepSeconds($pair['strikes']);
            Log::warning('Sign-in locked', ['email' => mb_strtolower(trim($email)), 'ip' => $ip, 'lockout' => $pair['strikes'], 'seconds' => $pair['until'] - $now]);
        }
        Cache::put($pairKey, $pair, $cfg['memory'] + max(0, $pair['until'] - $now));

        // same email from anywhere, and same IP for any email: a count in a window, then a short lock
        $account = self::windowed(self::accountKey($email), $cfg['account'], $now, 'email', mb_strtolower(trim($email)));
        $ipLock = self::windowed(self::ipKey($ip), $cfg['ip'], $now, 'ip', $ip);

        return max(0, max($pair['until'], $account, $ipLock) - $now);
    }

    // A failure counter that lasts `window` seconds from its first failure; at the limit it sets a lock.
    // Returns the lock's end time (0 if none).
    private static function windowed(string $key, array $rule, int $now, string $what, string $who): int
    {
        $state = Cache::get($key, ['fails' => 0, 'start' => $now, 'until' => 0]);
        if ($now - $state['start'] > $rule['window']) {
            $state = ['fails' => 0, 'start' => $now, 'until' => $state['until']];
        }
        $state['fails']++;
        if ($state['fails'] >= $rule['failures']) {
            $state = ['fails' => 0, 'start' => $now, 'until' => $now + $rule['lock']];
            Log::warning('Sign-in locked by volume', [$what => $who, 'seconds' => $rule['lock']]);
        }
        Cache::put($key, $state, $rule['window'] + $rule['lock']);

        return (int) $state['until'];
    }

    // A correct password: forget the failures and the lockout steps for this email and IP.
    public static function clear(string $email, string $ip): void
    {
        Cache::forget(self::pairKey($email, $ip));
        Cache::forget(self::accountKey($email));
    }
}
