<?php

namespace App\Http\Middleware;

use App\Models\KioskSetting;
use App\Models\KioskToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Guards the Attendance Station kiosk routes. The kiosk sends the token it got
// from POST /api/kiosk/unlock in the X-Kiosk-Token header. The answer for a bad
// token is 403, not 401, so it can never be mistaken for a user session expiring.
class EnsureKioskToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $plain = (string) $request->header('X-Kiosk-Token', '');

        $token = $plain !== '' ? KioskToken::where('token_hash', KioskToken::hash($plain))->first() : null;
        $setting = KioskSetting::current();

        if (! $token
            || $token->expires_at->isPast()
            || ! $setting->hasPin()
            || $token->pin_version !== $setting->pin_version) {
            return response()->json([
                'message' => 'This kiosk is locked. An HR security PIN is required.',
                'code' => 'kiosk_locked',
            ], 403);
        }

        // Renew the 30 days, at most every 5 minutes.
        if ($token->last_used_at === null || $token->last_used_at->lt(now()->subMinutes(5))) {
            $token->update([
                'last_used_at' => now(),
                'expires_at' => now()->addDays(KioskToken::LIFETIME_DAYS),
            ]);
        }

        return $next($request);
    }
}
