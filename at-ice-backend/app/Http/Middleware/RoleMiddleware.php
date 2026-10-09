<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    /**
     * Handle an incoming request.
     *
     * Usage in routes:
     *   ->middleware('role:admin')
     *   ->middleware('role:hr')
     *   ->middleware('role:employee')
     *   ->middleware('role:driver')
     *   ->middleware('role:customer')
     *   ->middleware('role:employee,checker')      ← employee + sub_role
     *   ->middleware('role:employee,salesman')
     *   ->middleware('role:employee,maintenance')
     *   ->middleware('role:employee,checker,maintenance') ← employee + multiple sub_roles
     *   ->middleware('role:admin,hr')              ← multiple roles allowed
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // ── Admin override — Admin can access everything ──
        if ($user->role === 'admin') {
            return $next($request);
        }

        // ── Sub_role check (e.g. 'role:employee,checker' or 'role:employee,checker,maintenance') ──
        $knownSubRoles = ['checker', 'salesman', 'maintenance'];

        if (count($roles) >= 2 && in_array($roles[1], $knownSubRoles)) {
            $requiredRole = $roles[0]; // 'employee'
            $allowedSubRoles = array_slice($roles, 1); // ['checker'] or ['checker', 'maintenance'], etc.

            if ($user->role === $requiredRole && in_array($user->sub_role, $allowedSubRoles)) {
                return $next($request);
            }

            return response()->json([
                'message' => 'Forbidden. Insufficient permissions.',
            ], 403);
        }

        // ── Multi-role check (e.g. 'role:admin,hr') ──
        if (in_array($user->role, $roles)) {
            return $next($request);
        }

        return response()->json([
            'message' => 'Forbidden. Insufficient permissions.',
        ], 403);
    }
}
