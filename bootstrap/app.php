<?php

use App\Http\Middleware\EnsureUserEnabled;
use App\Http\Middleware\EnsureUserIsAdmin;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // TLS is terminated by a reverse proxy / CDN in front of the container.
        // A lone "*" (or "**") must reach Laravel as a string: inside an array it is just an address that never matches.
        $proxies = trim((string) env('TRUSTED_PROXIES', ''));
        $middleware->trustProxies(at: in_array($proxies, ['*', '**'], true)
            ? $proxies
            : (array_values(array_filter(array_map('trim', explode(',', $proxies)))) ?: null));
        $middleware->alias(['enabled' => EnsureUserEnabled::class, 'admin' => EnsureUserIsAdmin::class]);
        $middleware->redirectGuestsTo(fn () => route('login'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('designer/designs*') || $request->expectsJson(),
        );
    })->create();
