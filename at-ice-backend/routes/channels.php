<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

// Realtime channels are private (owner, 2026-10-22): the browser asks
// POST /api/broadcasting/auth with its Bearer token, and only these roles may
// listen. Admin may listen to every channel.
$roles = fn (string ...$allowed) => fn (User $user) => $user->role === 'admin' || in_array($user->role, $allowed, true);

Broadcast::channel('attendance', $roles('hr'));
Broadcast::channel('inventory', $roles());
Broadcast::channel('payments', $roles());
Broadcast::channel('deliveries', $roles('driver'));
