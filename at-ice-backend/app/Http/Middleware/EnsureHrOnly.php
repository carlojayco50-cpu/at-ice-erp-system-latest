<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Payroll Records are HR only (owner decision): RoleMiddleware lets Admin pass
 * every role check, so the payroll routes add this check on top of role:hr.
 * 401 when signed out, 403 for everyone except HR, Admin included.
 */
class EnsureHrOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->role !== 'hr') {
            return response()->json(['message' => 'Forbidden. Insufficient permissions.'], 403);
        }

        return $next($request);
    }
}
