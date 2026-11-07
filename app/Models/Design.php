<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Fillable(['name', 'data', 'schema_version', 'thumbnail', 'is_public'])]
class Design extends Model
{
    protected function casts(): array
    {
        return [
            'data' => 'array',
            'is_public' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Make the design publicly viewable and return its token. */
    public function publish(): string
    {
        if (! $this->share_token) {
            $this->share_token = Str::lower(Str::random(16));
        }
        $this->is_public = true;
        $this->save();

        return $this->share_token;
    }

    public function unpublish(): void
    {
        $this->is_public = false;
        $this->save();
    }
}
