<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class DesignerController extends Controller
{
    /** Host page for the side-loaded React app (also used for /designer/* deep links). */
    public function index(Request $request)
    {
        return view('designer', ['boot' => self::boot($request)]);
    }

    public static function boot(Request $request, ?array $shared = null): array
    {
        $user = $request->user();

        return [
            'csrf' => csrf_token(),
            'user' => $user ? [
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'role' => $user->role,
            ] : null,
            'urls' => [
                'login' => route('login'),
                'logout' => route('logout'),
                'designs' => url('/designer/designs'),
                'home' => url('/'),
                'admin' => $user?->isAdmin() ? url('/admin') : null,
            ],
            'limits' => ['maxBlocks' => config('bitbrick.max_blocks')],
            'shared' => $shared,
        ];
    }
}
