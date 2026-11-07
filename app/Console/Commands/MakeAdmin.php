<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\AsCommand;
use Illuminate\Console\Command;

#[AsCommand(name: 'bitbrick:make-admin', description: 'Make a user an administrator (or revoke it with --revoke)')]
class MakeAdmin extends Command
{
    protected $signature = 'bitbrick:make-admin {email : Google account e-mail address} {--revoke : Make the user an end user again}';

    public function handle(): int
    {
        $email = strtolower(trim($this->argument('email')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('That is not a valid e-mail address.');

            return self::FAILURE;
        }

        $user = User::where('email', $email)->first();

        if ($this->option('revoke')) {
            if (! $user) {
                $this->error("No user with e-mail {$email}.");

                return self::FAILURE;
            }
            $user->forceFill(['role' => 'user'])->save();
            $this->info("{$email} is now an end user.");

            return self::SUCCESS;
        }

        if (! $user) {
            // Created ahead of the first sign-in; Google login links the account by e-mail.
            $user = new User(['name' => strstr($email, '@', true), 'email' => $email]);
            $user->forceFill(['role' => 'admin', 'status' => 'enabled'])->save();
            $this->info("Created {$email} as an administrator. They can now sign in with Google.");

            return self::SUCCESS;
        }

        $user->forceFill(['role' => 'admin', 'status' => 'enabled'])->save();
        $this->info("{$email} is now an administrator.");

        return self::SUCCESS;
    }
}
