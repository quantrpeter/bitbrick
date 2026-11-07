<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\AsCommand;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

#[AsCommand(name: 'bitbrick:set-password', description: 'Set (or reset) the password of an existing user')]
class SetPassword extends Command
{
    protected $signature = 'bitbrick:set-password {login : E-mail address or username} {--password= : Skip the prompt (visible in shell history, prefer the prompt)}';

    public function handle(): int
    {
        $login = Str::lower(trim($this->argument('login')));
        $user = User::where('email', $login)->orWhere('username', $login)->first();
        if (! $user) {
            $this->error("No user with e-mail or username {$login}.");

            return self::FAILURE;
        }

        $password = $this->option('password') ?? $this->secret('New password (8-72 characters)');
        if ($this->option('password') === null && $password !== $this->secret('Repeat the password')) {
            $this->error('The passwords do not match.');

            return self::FAILURE;
        }
        if (! is_string($password) || strlen($password) < 8 || strlen($password) > 72) {
            $this->error('The password must be 8 to 72 characters long.');

            return self::FAILURE;
        }

        $user->password = $password; // hashed by the model cast
        $user->save();
        $this->info("Password for {$user->email} was changed.");

        return self::SUCCESS;
    }
}
