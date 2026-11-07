<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'google_id', 'avatar'])] // role, status, username and password are set explicitly
#[Hidden(['password', 'remember_token', 'google_id'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function designs(): HasMany
    {
        return $this->hasMany(Design::class);
    }

    public function isEnabled(): bool
    {
        return $this->status === 'enabled';
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /** Listed in BITBRICK_ADMIN_EMAILS: always an administrator, cannot be demoted in the UI. */
    public function isConfiguredAdmin(): bool
    {
        return in_array(strtolower($this->email), config('bitbrick.admin_emails'), true);
    }
}
