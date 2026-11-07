<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));

        $users = User::query()
            ->withCount('designs')
            ->when($q !== '', function ($query) use ($q) {
                $like = '%'.addcslashes($q, '%_\\').'%';
                $query->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->simplePaginate(25)
            ->withQueryString();

        return view('admin', [
            'users' => $users,
            'q' => $q,
            'me' => $request->user(),
            'totals' => [
                'users' => User::count(),
                'admins' => User::where('role', 'admin')->count(),
                'disabled' => User::where('status', 'disabled')->count(),
            ],
        ]);
    }

    /** Create a user with a password (there is no self-registration, so this is how password accounts start). */
    public function store(Request $request): RedirectResponse
    {
        $request->merge([
            'email' => Str::lower(trim((string) $request->input('email'))),
            'username' => ($u = Str::lower(trim((string) $request->input('username')))) === '' ? null : $u,
        ]);

        $v = $request->validateWithBag('create', [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'username' => ['nullable', 'string', 'min:3', 'max:40', 'regex:/^[a-z0-9._-]+$/', 'unique:users,username'],
            'password' => ['required', 'string', 'min:8', 'max:72'],
            'role' => ['required', Rule::in(['user', 'admin'])],
        ]);

        $user = new User(['name' => $v['name'], 'email' => $v['email']]);
        $user->forceFill([
            'username' => $v['username'] ?? null,
            'role' => $v['role'],
            'status' => 'enabled',
            'password' => $v['password'], // hashed by the model cast
        ])->save();

        return $this->back("Created {$user->email}.");
    }

    public function updatePassword(Request $request, User $user): RedirectResponse
    {
        $v = $request->validateWithBag('password', ['password' => ['required', 'string', 'min:8', 'max:72']]);

        $user->password = $v['password'];
        $user->save();

        return $this->back("Password for {$user->email} was changed.");
    }

    public function updateRole(Request $request, User $user): RedirectResponse
    {
        $role = $request->validate(['role' => ['required', Rule::in(['user', 'admin'])]])['role'];

        if ($user->is($request->user())) {
            return $this->back('You cannot change your own role.', false);
        }
        if ($role === 'user' && $user->isConfiguredAdmin()) {
            return $this->back("{$user->email} is listed in BITBRICK_ADMIN_EMAILS and stays an administrator.", false);
        }

        $user->forceFill(['role' => $role])->save();

        return $this->back("{$user->email} is now ".($role === 'admin' ? 'an administrator.' : 'an end user.'));
    }

    public function updateStatus(Request $request, User $user): RedirectResponse
    {
        $status = $request->validate(['status' => ['required', Rule::in(['enabled', 'disabled'])]])['status'];

        if ($user->is($request->user())) {
            return $this->back('You cannot disable your own account.', false);
        }

        $user->forceFill(['status' => $status])->save();

        return $this->back("{$user->email} is now {$status}.");
    }

    private function back(string $message, bool $ok = true): RedirectResponse
    {
        return back()->with($ok ? 'ok' : 'fail', $message);
    }
}
