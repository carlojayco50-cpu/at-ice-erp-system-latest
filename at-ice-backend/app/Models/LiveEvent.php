<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LiveEvent extends Model
{
    const UPDATED_AT = null;

    protected $fillable = ['module', 'action', 'message', 'roles', 'user_ids', 'actor_id'];

    protected $casts = [
        'roles' => 'array',
        'user_ids' => 'array',
    ];

    // Admin sees every event; others see events for their role
    // ("employee:checker" for sub-roles) or addressed to them.
    public function isFor(User $user): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        $roles = $this->roles ?? [];
        $mine = $user->sub_role ? "{$user->role}:{$user->sub_role}" : $user->role;

        return in_array($user->role, $roles, true)
            || in_array($mine, $roles, true)
            || in_array($user->id, $this->user_ids ?? [], false);
    }
}
