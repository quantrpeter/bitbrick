<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Creates the administrators: peter@quantr.hk (username "admin") plus anyone in BITBRICK_ADMIN_EMAILS.
     * Admins can sign in with Google (linked by e-mail) or, when they have a password, with it.
     * The password of peter@quantr.hk comes from BITBRICK_ADMIN_PASSWORD (never hard-coded here); when that
     * is set, running the seeder resets it to that value.
     * Safe to run repeatedly (existing users are promoted, never duplicated).
     */
    public function run(): void
    {
        $emails = array_unique(['peter@quantr.hk', ...config('bitbrick.admin_emails')]);

        foreach ($emails as $email) {
            $user = User::firstOrNew(['email' => $email]);
            if (! $user->exists) {
                $user->name = $email === 'peter@quantr.hk' ? 'admin' : strstr($email, '@', true);
            }
            $user->forceFill(['role' => 'admin', 'status' => 'enabled']);

            if ($email === 'peter@quantr.hk') {
                $user->username ??= 'admin';
                if (filled(config('bitbrick.admin_password'))) {
                    $user->password = config('bitbrick.admin_password'); // hashed by the model cast
                }
            }

            $user->save();
        }
    }
}
