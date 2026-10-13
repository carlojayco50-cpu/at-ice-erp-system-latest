<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\User;
use App\Rules\ExistingMailbox;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// Login email fixes made by a role higher up:
//   Admin: HR, employee, driver and customer logins.
//   HR:    employee and driver logins.
// Nobody changes an Admin's login here.
class AccountController extends Controller
{
    private const CAN_MANAGE = [
        'admin' => ['hr', 'employee', 'driver', 'customer'],
        'hr' => ['employee', 'driver'],
    ];

    private function mayManage(Request $request, User $user): bool
    {
        return in_array($user->role, self::CAN_MANAGE[$request->user()->role] ?? [], true);
    }

    // PUT /api/accounts/{user}/email
    // Fixes a wrong login email. The account is signed out everywhere. For a
    // customer, the contact email on the customer record follows when it was the
    // same as the old login.
    public function updateEmail(Request $request, User $user)
    {
        if (! $this->mayManage($request, $user)) {
            return response()->json(['message' => 'You cannot change this account\'s login email.'], 403);
        }

        $request->merge(['email' => mb_strtolower(trim((string) $request->email))]);
        $request->validate([
            // A customer's login is a real mailbox, so the account itself must exist.
            'email' => array_merge(
                ['bail', 'required', 'email:rfc,filter,dns', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
                $user->role === 'customer' ? [new ExistingMailbox] : [],
            ),
        ], [
            'email.unique' => 'That email already has a login account.',
        ]);

        $old = $user->email;
        DB::transaction(function () use ($user, $old, $request) {
            $user->update(['email' => $request->email]);
            // The login changed, so every session of this account ends: whoever was
            // signed in with the old email (or holds a stolen token) must sign in again.
            $user->tokens()->delete();
            if ($user->role === 'customer') {
                Customer::where('user_id', $user->id)->where('email', $old)->update(['email' => $request->email]);
            }
        });

        return response()->json(['id' => $user->id, 'email' => $user->email]);
    }
}
