<?php

namespace App\Http\Controllers;

use App\Models\KioskSetting;
use App\Models\KioskToken;
use App\Services\KioskLockout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class KioskController extends Controller
{
    // POST /api/kiosk/unlock (public). The only place the PIN is checked.
    public function unlock(Request $request)
    {
        $request->validate(
            ['pin' => ['required', 'string', 'regex:/^\d{4}$/']],
            ['pin.regex' => 'The PIN must be exactly 4 digits.']
        );

        $ip = (string) $request->ip();

        $wait = KioskLockout::retryAfter($ip);
        if ($wait > 0) {
            $minutes = (int) ceil($wait / 60);

            return response()->json([
                'message' => "Too many wrong PINs. Try again in {$minutes} minute(s), or ask HR to clear the lockout.",
                'code' => 'kiosk_locked_out',
                'retry_after_seconds' => $wait,
            ], 429);
        }

        $setting = KioskSetting::current();

        if (! $setting->hasPin()) {
            return response()->json([
                'message' => 'The kiosk PIN has not been set yet. Ask HR to set it.',
                'code' => 'kiosk_pin_not_set',
            ], 409);
        }

        if (! $setting->checkPin((string) $request->pin)) {
            KioskLockout::recordFailure($ip);

            $wait = KioskLockout::retryAfter($ip);
            if ($wait > 0) {
                $minutes = (int) ceil($wait / 60);

                return response()->json([
                    'message' => "Too many wrong PINs. Try again in {$minutes} minute(s), or ask HR to clear the lockout.",
                    'code' => 'kiosk_locked_out',
                    'retry_after_seconds' => $wait,
                ], 429);
            }

            return response()->json([
                'message' => 'Wrong PIN.',
                'attempts_remaining' => KioskLockout::attemptsLeft($ip),
            ], 422);
        }

        KioskLockout::recordSuccess($ip);

        // Drop tokens that have expired.
        KioskToken::where('expires_at', '<', now())->delete();

        $plain = Str::random(64);
        $token = KioskToken::create([
            'token_hash' => KioskToken::hash($plain),
            'pin_version' => $setting->pin_version,
            'expires_at' => now()->addDays(KioskToken::LIFETIME_DAYS),
            'last_used_at' => now(),
            'created_ip' => $ip,
        ]);

        return response()->json([
            'token' => $plain,
            'expires_at' => $token->expires_at,
        ]);
    }

    // GET /api/kiosk/status (kiosk token required). The kiosk page uses it to
    // check that it is still unlocked.
    public function status()
    {
        return response()->json(['unlocked' => true]);
    }

    // GET /api/hr/kiosk-pin
    public function show()
    {
        $setting = KioskSetting::current()->load('changedBy:id,name');

        return response()->json([
            'pin_set' => $setting->hasPin(),
            'pin_changed_at' => $setting->pin_changed_at,
            'pin_changed_by' => $setting->changedBy?->name,
            'unlocked_kiosks' => KioskToken::where('expires_at', '>', now())
                ->where('pin_version', $setting->pin_version)
                ->count(),
            'locked_out' => KioskLockout::isLocked(),
        ]);
    }

    // PUT /api/hr/kiosk-pin. Sets the first PIN or changes it. Needs the account
    // password of the person making the change.
    public function update(Request $request)
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'pin' => ['required', 'string', 'regex:/^\d{4}$/', 'confirmed'],
        ], [
            'pin.regex' => 'The PIN must be exactly 4 digits.',
        ]);

        $this->assertPassword($request, $data['current_password']);

        KioskSetting::current()->setPin($data['pin'], $request->user()->id);
        KioskLockout::clearAll();

        return response()->json(['message' => 'Kiosk PIN saved. Every kiosk must be unlocked again with the new PIN.']);
    }

    // POST /api/hr/kiosk-pin/clear-lockout
    public function clearLockout(Request $request)
    {
        $data = $request->validate(['current_password' => 'required|string']);

        $this->assertPassword($request, $data['current_password']);

        KioskLockout::clearAll();

        return response()->json(['message' => 'Lockout cleared.']);
    }

    private function assertPassword(Request $request, string $password): void
    {
        if (! Hash::check($password, $request->user()->password)) {
            abort(response()->json([
                'message' => 'Your account password is incorrect.',
                'errors' => ['current_password' => ['Your account password is incorrect.']],
            ], 422));
        }
    }
}
