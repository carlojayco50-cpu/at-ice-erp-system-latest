<?php

namespace App\Http\Controllers;

use App\Mail\KioskLocked;
use App\Models\KioskDevice;
use App\Models\KioskSetting;
use App\Models\KioskToken;
use App\Models\LiveEvent;
use App\Models\User;
use App\Support\Audit;
use App\Support\Settings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

// Attendance Station kiosk. Each kiosk computer sends its own random kiosk ID
// (device_id). After kiosk.max_wrong_pins wrong HR PINs in a row that kiosk is
// locked with no time limit; only the Admin override PIN typed on that kiosk
// unlocks it. HR cannot unlock a kiosk. Every attempt is logged.
class KioskController extends Controller
{
    private const DEVICE_RULE = ['required', 'string', 'regex:/^[A-Za-z0-9-]{16,64}$/'];

    // POST /api/kiosk/unlock (public) { device_id, pin }
    public function unlock(Request $request)
    {
        $request->validate(
            ['device_id' => self::DEVICE_RULE, 'pin' => ['required', 'string', 'regex:/^\d{4}$/']],
            ['pin.regex' => 'The PIN must be exactly 4 digits.']
        );

        $ip = (string) $request->ip();
        $device = KioskDevice::for($request->device_id, $ip);

        // The device id comes from the browser, so a new one would reset the
        // per-kiosk count. Wrong PINs are also counted per network address
        // across every kiosk (kiosk.max_wrong_pins_per_ip an hour).
        $ipKey = 'kiosk-pin:'.sha1($ip);
        $ipMax = max(1, (int) Settings::get('kiosk.max_wrong_pins_per_ip'));
        if (RateLimiter::tooManyAttempts($ipKey, $ipMax)) {
            $device->log('blocked', $ip);

            return response()->json([
                'message' => 'Too many wrong PINs from this network. Try again in '.(int) ceil(RateLimiter::availableIn($ipKey) / 60).' minutes or ask an Admin.',
                'code' => 'kiosk_ip_blocked',
            ], 403);
        }

        if ($device->isLocked()) {
            $device->log('blocked', $ip);

            return $this->lockedResponse();
        }

        $setting = KioskSetting::current();
        if (! $setting->hasPin()) {
            return response()->json([
                'message' => 'The kiosk PIN has not been set yet. Ask HR to set it.',
                'code' => 'kiosk_pin_not_set',
            ], 409);
        }

        if (! $setting->checkPin((string) $request->pin)) {
            RateLimiter::hit($ipKey, 3600);
            if (RateLimiter::attempts($ipKey) === $ipMax) {
                Audit::log('kiosk.ip_blocked', $device, null, ['ip' => $ip, 'wrong_pins' => $ipMax]);
            }
            if ($device->wrongPin($ip)) {
                $notified = $this->notifyLocked($device, $ip);
                Audit::log('kiosk.locked', $device, null, ['ip' => $ip, 'notified' => $notified]);

                return $this->lockedResponse();
            }

            return response()->json([
                'message' => 'Wrong PIN.',
                'attempts_remaining' => $device->attemptsLeft(),
            ], 422);
        }

        $device->unlocked($ip);

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

    // A kiosk just locked (R3): a live notice to HR and Admin and an email to
    // every Admin and HR account with the kiosk and the time. Returns how many
    // emails were sent. The PIN screen does not know who was typing, so only
    // the kiosk, time and IP are reported.
    private function notifyLocked(KioskDevice $device, string $ip): int
    {
        $kiosk = strtoupper(substr($device->device_id, 0, 8));
        $at = now(config('atice.timezone'))->format('M j, Y g:i A');
        LiveEvent::create([
            'module' => 'kiosk',
            'action' => 'locked',
            'message' => "Kiosk {$kiosk} is locked after too many wrong PINs ({$at}).",
            'roles' => ['hr'],
        ]);

        $sent = 0;
        foreach (User::whereIn('role', ['admin', 'hr'])->whereNotNull('email')->pluck('email') as $email) {
            try {
                Mail::to($email)->send(new KioskLocked($kiosk, $at, $ip));
                $sent++;
            } catch (\Throwable $e) {
                Log::warning("Kiosk locked email to {$email} failed: ".$e->getMessage());
            }
        }

        return $sent;
    }

    // POST /api/kiosk-devices/{id}/unlock (Admin; HR too when the
    // kiosk.hr_can_override setting is on): unlock a locked kiosk from the
    // Kiosk PIN page instead of on the kiosk itself.
    public function remoteUnlock(Request $request, $id)
    {
        if ($request->user()->role !== 'admin' && ! Settings::get('kiosk.hr_can_override')) {
            return response()->json(['message' => 'Only an Admin can unlock a kiosk.'], 403);
        }
        $device = KioskDevice::findOrFail($id);
        $before = ['locked_at' => $device->locked_at?->toDateTimeString(), 'failed_attempts' => $device->failed_attempts];
        $device->forceFill(['locked_at' => null, 'failed_attempts' => 0])->save();
        $device->log('override_ok', (string) $request->ip());
        Audit::log('kiosk.override', $device, $before, ['locked_at' => null, 'by' => $request->user()->role]);

        return response()->json(['message' => 'Kiosk unlocked. Enter the HR PIN on it to start.']);
    }

    // GET /api/kiosk/lock-state?device_id= (public): is this kiosk locked?
    public function lockState(Request $request)
    {
        $request->validate(['device_id' => self::DEVICE_RULE]);
        $device = KioskDevice::where('device_id', $request->device_id)->first();

        return response()->json(['locked' => (bool) $device?->isLocked()]);
    }

    // POST /api/kiosk/override (public, on the locked kiosk) { device_id, admin_pin }
    public function override(Request $request)
    {
        $request->validate(
            ['device_id' => self::DEVICE_RULE, 'admin_pin' => ['required', 'string', 'regex:/^\d{6}$/']],
            ['admin_pin.regex' => 'The Admin PIN is 6 digits.']
        );

        $ip = (string) $request->ip();
        $device = KioskDevice::for($request->device_id, $ip);
        $setting = KioskSetting::current();

        if (! $setting->hasAdminPin()) {
            return response()->json(['message' => 'No Admin override PIN has been set. Admin sets it in Settings.'], 409);
        }
        if (! $setting->checkAdminPin((string) $request->admin_pin)) {
            $device->log('override_wrong', $ip);
            Audit::log('kiosk.override_failed', $device, null, ['ip' => $ip]);

            return response()->json(['message' => 'Wrong Admin PIN.'], 422);
        }

        $before = ['locked_at' => $device->locked_at?->toDateTimeString(), 'failed_attempts' => $device->failed_attempts];
        $device->forceFill(['locked_at' => null, 'failed_attempts' => 0])->save();
        $device->log('override_ok', $ip);
        Audit::log('kiosk.override', $device, $before, ['locked_at' => null, 'ip' => $ip]);

        return response()->json(['message' => 'Kiosk unlocked by Admin. Enter the HR PIN to start.']);
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
            // Locked kiosks are shown to HR, but only Admin can unlock them (on the kiosk).
            'locked_kiosks' => KioskDevice::whereNotNull('locked_at')->orderByDesc('locked_at')
                ->get(['id', 'device_id', 'locked_at', 'last_ip'])
                ->map(fn ($d) => ['id' => $d->id, 'kiosk' => strtoupper(substr($d->device_id, 0, 8)), 'locked_at' => $d->locked_at, 'ip' => $d->last_ip]),
            'can_unlock' => request()->user()?->role === 'admin' || (bool) Settings::get('kiosk.hr_can_override'),
            'admin_pin_set' => $setting->hasAdminPin(),
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
        Audit::log('kiosk.pin_changed');

        return response()->json(['message' => 'Kiosk PIN saved. Every kiosk must be unlocked again with the new PIN.']);
    }

    // PUT /api/admin/kiosk-override-pin (Admin). The 6-digit PIN Admin types on a
    // locked kiosk. Needs Admin's account password.
    public function setAdminPin(Request $request)
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'admin_pin' => ['required', 'string', 'regex:/^\d{6}$/', 'confirmed'],
        ], [
            'admin_pin.regex' => 'The Admin override PIN must be exactly 6 digits.',
        ]);

        $this->assertPassword($request, $data['current_password']);

        KioskSetting::current()->setAdminPin($data['admin_pin']);
        Audit::log('kiosk.admin_pin_changed');

        return response()->json(['message' => 'Admin override PIN saved.']);
    }

    // GET /api/admin/kiosk-attempts : the latest kiosk PIN attempts (Admin).
    public function attempts()
    {
        return response()->json(DB::table('kiosk_attempts')
            ->join('kiosk_devices', 'kiosk_devices.id', '=', 'kiosk_attempts.kiosk_device_id')
            ->orderByDesc('kiosk_attempts.id')
            ->limit(200)
            ->get(['kiosk_attempts.id', 'kiosk_devices.device_id', 'kiosk_attempts.result', 'kiosk_attempts.ip', 'kiosk_attempts.created_at'])
            ->map(fn ($a) => ['kiosk' => strtoupper(substr($a->device_id, 0, 8))] + (array) $a));
    }

    private function lockedResponse()
    {
        return response()->json([
            'message' => 'This kiosk is locked after too many wrong PINs. Only an Admin can unlock it here with the Admin PIN.',
            'code' => 'kiosk_locked',
        ], 423);
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
