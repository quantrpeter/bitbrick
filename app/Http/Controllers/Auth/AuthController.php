<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    /** Valid bcrypt hash of a random string: checked when the user does not exist, so timing does not reveal it. */
    private const DUMMY_HASH = '$2y$12$uEysteT5YfQI17ALSOmVf.1xd2KKigHAFP/s3wQRvphhhTTVKRyhi';

    private const MAX_ATTEMPTS = 5;

    public function show(Request $request)
    {
        if (Auth::check()) {
            return redirect('/designer');
        }

        // ?next=/designer/... lets the SPA send people back where they were.
        // Only same-site relative paths are accepted (no open redirect).
        $next = (string) $request->query('next', '');
        if (preg_match('#^/(?!/)[^\\\\\r\n]*$#', $next)) {
            $request->session()->put('url.intended', url($next));
        }

        return view('login');
    }

    /** Sign in with e-mail address or username, plus password. */
    public function login(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ]);

        $login = Str::lower(trim($data['login']));
        $key = 'login:'.$login.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($key);

            return $this->fail($request, "Too many attempts. Try again in {$seconds} seconds.");
        }

        $user = User::where('email', $login)->orWhere('username', $login)->first();

        // Always run one hash check, whether or not the user exists. Accounts that only use
        // Google have no password and can never match.
        $matches = Hash::check($data['password'], $user?->password ?: self::DUMMY_HASH)
            && $user !== null && filled($user->password);

        if (! $matches) {
            RateLimiter::hit($key, 60);

            return $this->fail($request, 'These credentials do not match our records.');
        }

        if (! $user->isEnabled()) {
            RateLimiter::hit($key, 60);

            return $this->fail($request, 'Your account is disabled.');
        }

        RateLimiter::clear($key);
        Auth::login($user, $request->boolean('remember'));
        $request->session()->regenerate();

        return redirect()->intended('/designer');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }

    private function fail(Request $request, string $message): RedirectResponse
    {
        return redirect()->route('login')->withInput($request->only('login', 'remember'))->withErrors(['login' => $message]);
    }
}
