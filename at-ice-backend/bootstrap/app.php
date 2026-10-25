<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // Private realtime channels (routes/channels.php): the SPA signs each
    // subscription at POST /api/broadcasting/auth with its Sanctum token.
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api', 'middleware' => ['auth:sanctum']])
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'role' => \App\Http\Middleware\RoleMiddleware::class,
            'password.changed' => \App\Http\Middleware\EnsurePasswordChanged::class,
            'kiosk' => \App\Http\Middleware\EnsureKioskToken::class,
            'timed.in' => \App\Http\Middleware\EnsureTimedIn::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
