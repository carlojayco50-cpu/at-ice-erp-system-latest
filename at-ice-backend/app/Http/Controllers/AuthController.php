<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\LoginLockout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    // LOGIN with progressive lockout (App\Services\LoginLockout): every 5 wrong
    // passwords in a row lock the email from that IP for 3, 5, 10, 15, 30, then
    // 60 minutes. The lock is checked before the password, so a correct password
    // does not get in while it lasts. Wider limits on one email from many IPs and
    // one IP on many emails are in the service. Failures are counted for every
    // email typed, real or not, and the replies are the same, so they show nothing
    // about which accounts exist.
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $ip = (string) $request->ip();

        if ($seconds = LoginLockout::secondsLeft($request->email, $ip)) {
            return $this->lockedResponse($seconds);
        }

        // Attempt login
        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            // This failure may have just started a lockout: tell the browser now
            if ($seconds = LoginLockout::recordFailure($request->email, $ip)) {
                return $this->lockedResponse($seconds);
            }

            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        // Success: the failure count and lockout steps start over
        LoginLockout::clear($request->email, $ip);

        // Block deactivated accounts (e.g. an employee deactivated by HR).
        // Checked only after the password is correct, so this message does
        // not reveal which emails exist. A NULL is_active (older seeded
        // accounts) is treated as active.
        if ($user->is_active !== null && ! (bool) $user->is_active) {
            return response()->json([
                'message' => 'This account has been deactivated. Please contact HR or the Admin.',
            ], 403);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'role' => $user->role,
            'sub_role' => $user->sub_role ?? null,
            'must_change_password' => (bool) $user->must_change_password,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ]);
    }

    // The reply while sign-in is locked. retry_after_seconds and locked_until come from the
    // server's clock, so the page's countdown ends when the lock really ends.
    private function lockedResponse(int $seconds)
    {
        $minutes = (int) ceil($seconds / 60);

        return response()->json([
            'message' => "Too many login attempts. Please try again in {$minutes} minute(s).",
            'retry_after_seconds' => $seconds,
            'locked_until' => now()->addSeconds($seconds)->toIso8601String(),
        ], 429)->header('Retry-After', (string) $seconds);
    }

    // LOGOUT
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    // GET CURRENT USER
    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    // CHANGE PASSWORD (any logged-in role: admin, hr, employee, driver, customer)
    // Requires the current password, and signs out every OTHER device/session
    // so a leaked initial password stops working right after it is changed.
    public function changePassword(Request $request)
    {
        $user = $request->user();

        // On the forced first-login change the one-time password was already
        // checked at login, so the form does not ask for it again.
        $firstLogin = (bool) $user->must_change_password;

        $validated = $request->validate([
            'current_password' => $firstLogin ? 'nullable|string' : 'required|string',
            // At least 8 characters with uppercase, lowercase, a number and a special character.
            'password' => ['required', 'string', 'max:100', 'confirmed', 'different:current_password',
                Password::min(8)->mixedCase()->numbers()->symbols()],
        ]);

        if ($firstLogin) {
            if (Hash::check($validated['password'], $user->password)) {
                return response()->json([
                    'message' => 'Choose a password different from your one-time password.',
                    'errors' => ['password' => ['Choose a password different from your one-time password.']],
                ], 422);
            }
        } elseif (! Hash::check($validated['current_password'], $user->password)) {
            return response()->json([
                'message' => 'Your current password is incorrect.',
                'errors' => ['current_password' => ['Your current password is incorrect.']],
            ], 422);
        }

        $user->update([
            'password' => Hash::make($validated['password']),
            'must_change_password' => false,
        ]);

        $currentTokenId = $request->user()->currentAccessToken()->id;
        $user->tokens()->where('id', '!=', $currentTokenId)->delete();

        return response()->json(['message' => 'Password changed successfully.']);
    }

    // SIGN OUT OTHER DEVICES (all roles)
    // Deletes every token of this user except the one used for this request,
    // so the current device stays signed in.
    public function logoutOthers(Request $request)
    {
        $currentTokenId = $request->user()->currentAccessToken()->id;
        $count = $request->user()->tokens()->where('id', '!=', $currentTokenId)->delete();

        return response()->json([
            'message' => $count > 0
                ? "Signed out of {$count} other device(s)."
                : 'No other devices were signed in.',
            'signed_out' => $count,
        ]);
    }
}
