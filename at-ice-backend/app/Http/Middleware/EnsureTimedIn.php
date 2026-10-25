<?php

namespace App\Http\Middleware;

use App\Support\OnShift;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A Checker, Salesman, Maintenance employee or Driver saves nothing
 * (POST/PUT/PATCH/DELETE) until they have timed in at the Attendance Station
 * kiosk (owner, 2026-10-16 for the Checker, 2026-10-20 for everyone). Reading
 * is still allowed. Only employees and Drivers are checked; Admin passes. 403,
 * never 401, so the session expiry handler on the frontend is not triggered.
 */
class EnsureTimedIn
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($request->isMethodSafe() || ! $user || ! in_array($user->role, ['employee', 'driver'], true)) {
            return $next($request);
        }

        if (! OnShift::isTimedIn($user)) {
            return response()->json([
                'message' => 'Please time in at the Attendance Station first. You can save once your Time In is recorded today.',
                'needs_time_in' => true,
            ], 403);
        }

        return $next($request);
    }
}
