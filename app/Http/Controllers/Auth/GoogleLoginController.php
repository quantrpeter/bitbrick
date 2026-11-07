<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Symfony\Component\HttpFoundation\RedirectResponse;

class GoogleLoginController extends Controller
{
    public function redirect(): RedirectResponse
    {
        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (InvalidStateException) {
            return $this->fail('Google login expired. Please try again.');
        } catch (\Throwable $e) {
            Log::warning('Google login failed', ['error' => $e->getMessage()]);

            return $this->fail('Google login failed. Please try again.');
        }

        $email = strtolower((string) $googleUser->getEmail());
        $verified = $googleUser->user['email_verified'] ?? $googleUser->user['verified_email'] ?? false;

        if ($email === '' || ! filter_var($verified, FILTER_VALIDATE_BOOLEAN)) {
            return $this->fail('Your Google e-mail address is not verified.');
        }

        if (! $this->domainAllowed($email)) {
            return $this->fail('This e-mail domain is not allowed to sign in yet.');
        }

        $user = $this->findOrCreateUser($googleUser, $email);

        // Verified Google address on the admin list: make sure the account is an administrator.
        if ($user->isConfiguredAdmin() && ! $user->isAdmin()) {
            $user->forceFill(['role' => 'admin'])->save();
        }

        if (! $user->isEnabled()) {
            return $this->fail('Your account is disabled.');
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return redirect()->intended('/designer');
    }

    public function findOrCreateUser(SocialiteUser $googleUser, string $email): User
    {
        $user = User::where('google_id', $googleUser->getId())->first()
            ?? User::where('email', $email)->first();

        if ($user) {
            $user->forceFill([
                'google_id' => $googleUser->getId(),
                'avatar' => $googleUser->getAvatar() ?: $user->avatar,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            return $user;
        }

        $user = new User([
            'name' => $googleUser->getName() ?: $googleUser->getNickname() ?: 'Google User',
            'email' => $email,
            'google_id' => $googleUser->getId(),
            'avatar' => $googleUser->getAvatar(),
        ]);
        // role/status are not mass-assignable on purpose.
        $user->forceFill(['role' => 'user', 'status' => 'enabled', 'email_verified_at' => now()])->save();

        return $user;
    }

    private function domainAllowed(string $email): bool
    {
        $allowed = config('bitbrick.allowed_domains');
        if (! $allowed) {
            return true;
        }

        return in_array(substr(strrchr($email, '@'), 1), $allowed, true);
    }

    private function fail(string $message): RedirectResponse
    {
        return redirect()->route('login')->withErrors(['login' => $message]);
    }
}
