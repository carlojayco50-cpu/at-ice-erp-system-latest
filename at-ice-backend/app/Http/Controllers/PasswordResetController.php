<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetCode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rules\Password;
use Throwable;

// "Forgot password?" on the login page (public, no login needed):
// 1. POST /api/forgot-password {email}: emails a 6-digit code. The answer is
//    the same whether or not the email has an account, so nobody can use it
//    to find out who has one.
// 2. POST /api/verify-reset-code {email, code}: checks the code first, so the
//    page asks for the new password only after a correct code.
// 3. POST /api/reset-password {email, code, password, password_confirmation}:
//    a correct code sets the new password and signs the account out everywhere.
// The code is stored hashed in password_reset_tokens, works for 15 minutes and
// only once. 5 wrong tries lock the email for 15 minutes: the code is cancelled,
// no new code is made or sent, and asking for a new code does not reset the
// count. The count is kept in the cache and works on the database store.
class PasswordResetController extends Controller
{
    private const MINUTES = 15;

    private const MAX_TRIES = 5;

    public function sendCode(Request $request)
    {
        $request->merge(['email' => mb_strtolower(trim((string) $request->email))]);
        $request->validate(['email' => 'required|email|max:255']);

        $user = User::where('email', $request->email)->first();
        // While locked nothing is made or sent, and the answer below is the same.
        if ($user && ! $this->isLocked($user->email)) {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            // The wrong-try count is NOT reset here, so a new code cannot be used
            // to get more guesses.
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => Hash::make($code), 'created_at' => now()],
            );
            try {
                Mail::to($user->email)->send(new PasswordResetCode($code, self::MINUTES));
            } catch (Throwable $e) {
                Log::warning('Password reset email failed: '.$e->getMessage());
            }
        }

        return response()->json(['message' => 'If that email has an account, a 6-digit code was sent to it. Check your inbox and spam folder.']);
    }

    public function verifyCode(Request $request)
    {
        $request->merge(['email' => mb_strtolower(trim((string) $request->email))]);
        $request->validate([
            'email' => 'required|email|max:255',
            'code' => 'required|digits:6',
        ]);

        if (! $this->codeMatches($request->email, $request->code)) {
            return $this->wrongCode();
        }

        return response()->json(['message' => 'Code confirmed. Choose a new password.']);
    }

    public function reset(Request $request)
    {
        $request->merge(['email' => mb_strtolower(trim((string) $request->email))]);
        $request->validate([
            'email' => 'required|email|max:255',
            'code' => 'required|digits:6',
            'password' => ['required', 'string', 'max:100', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
        ]);

        if (! $this->codeMatches($request->email, $request->code)) {
            return $this->wrongCode();
        }

        $user = User::where('email', $request->email)->first();
        if (! $user) {
            return $this->wrongCode();
        }

        DB::transaction(function () use ($user, $request) {
            $user->update(['password' => $request->password, 'must_change_password' => false]);
            $user->tokens()->delete();
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
        });
        Cache::forget($this->triesKey($user->email));

        return response()->json(['message' => 'Your password was changed. Sign in with your new password.']);
    }

    // True when the code is right and not expired. A wrong code counts as a
    // try, and the 5th wrong try cancels the code and locks the email.
    private function codeMatches(string $email, string $code): bool
    {
        if ($this->isLocked($email)) {
            return false;
        }

        $row = DB::table('password_reset_tokens')->where('email', $email)->first();
        if (! $row || now()->diffInMinutes($row->created_at, true) > self::MINUTES) {
            return false;
        }
        if (! Hash::check($code, $row->token)) {
            if ($this->recordWrongTry($email) >= self::MAX_TRIES) {
                DB::table('password_reset_tokens')->where('email', $email)->delete();
            }

            return false;
        }

        return true;
    }

    private function isLocked(string $email): bool
    {
        return (int) Cache::get($this->triesKey($email), 0) >= self::MAX_TRIES;
    }

    // Adds one wrong try and returns the total. The counter is created first with
    // add(): on the database cache store increment() does nothing for a key that
    // does not exist yet, so without this the count would never start. add() also
    // fixes the lifetime at the first wrong try, so the lock ends 15 minutes later.
    private function recordWrongTry(string $email): int
    {
        $key = $this->triesKey($email);
        Cache::add($key, 0, now()->addMinutes(self::MINUTES));

        return (int) (Cache::increment($key) ?: 1);
    }

    private function wrongCode()
    {
        $text = 'The code is wrong or has expired. Ask for a new code.';

        return response()->json(['message' => $text, 'errors' => ['code' => [$text]]], 422);
    }

    private function triesKey(string $email): string
    {
        return 'pwreset:tries:'.sha1($email);
    }
}
