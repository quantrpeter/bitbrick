<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Users - BitBrick admin</title>
    @include('partials.site-css')
    <style>
        .wrap.wide { max-width: 1100px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
        th { color: var(--muted); font-weight: 600; }
        .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; border: 1px solid var(--line); }
        .badge.admin { background: var(--brand); color: var(--brand-fg); border-color: var(--brand); }
        .badge.disabled { color: #8a1c1c; border-color: #8a1c1c; }
        .ok { background: #e6f4ea; color: #14532d; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
        form.inline { display: inline; margin: 0; }
        .btn.small { padding: 4px 10px; font-size: 13px; }
        .tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 16px 0; }
        input[type=search] { padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); font: inherit; min-width: 240px; }
        .scroll { overflow-x: auto; }
        .pager { display: flex; gap: 12px; margin-top: 16px; }
        details.pw { display: inline-block; vertical-align: middle; }
        details.pw summary { cursor: pointer; color: var(--brand); font-size: 13px; padding: 4px 6px; }
        details.pw form { display: flex; gap: 6px; margin-top: 6px; }
        input[type=text], input[type=password], input[type=email], select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); font: inherit; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; align-items: end; }
        .grid label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
        .avatar { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
    </style>
</head>
<body>
<div class="wrap wide">
    <header class="site">
        <a class="logo" href="/">BitBrick <span class="muted" style="font-weight:400">admin</span></a>
        <span>
            <a class="btn secondary" href="/designer">Designer</a>
            <form class="inline" method="post" action="{{ route('logout') }}">@csrf
                <button class="btn secondary" type="submit">Sign out</button>
            </form>
        </span>
    </header>

    @if (session('ok')) <div class="ok" role="status">{{ session('ok') }}</div> @endif
    @if (session('fail')) <div class="error" role="alert">{{ session('fail') }}</div> @endif
    @if ($errors->hasBag('password')) <div class="error" role="alert">{{ $errors->getBag('password')->first() }}</div> @endif
    @if ($errors->hasBag('default')) <div class="error" role="alert">{{ $errors->getBag('default')->first() }}</div> @endif

    <main class="card">
        <h1 style="margin-top:0">Users</h1>
        <p class="muted">{{ $totals['users'] }} users, {{ $totals['admins'] }} administrators, {{ $totals['disabled'] }} disabled.
            Administrators can manage users here; end users can only design and save their own parts.</p>

        <details class="create" @if ($errors->hasBag('create')) open @endif style="margin:16px 0">
            <summary class="btn secondary small" style="display:inline-block">Add user with password</summary>
            @if ($errors->hasBag('create')) <div class="error" role="alert" style="margin-top:10px">{{ $errors->getBag('create')->first() }}</div> @endif
            <form method="post" action="/admin/users" class="grid" style="margin-top:12px" autocomplete="off">@csrf
                <label>Name <input type="text" name="name" required maxlength="120" value="{{ old('name') }}"></label>
                <label>E-mail <input type="email" name="email" required maxlength="255" value="{{ old('email') }}"></label>
                <label>Username (optional) <input type="text" name="username" maxlength="40" pattern="[A-Za-z0-9._\-]{3,40}" value="{{ old('username') }}"></label>
                <label>Password (8+ characters) <input type="password" name="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
                <label>Role <select name="role"><option value="user">End user</option><option value="admin">Admin</option></select></label>
                <button class="btn small" type="submit">Create</button>
            </form>
        </details>

        <form class="tools" method="get" action="{{ route('admin.users') }}">
            <input type="search" name="q" value="{{ $q }}" placeholder="Search name or e-mail" aria-label="Search users">
            <button class="btn small" type="submit">Search</button>
            @if ($q !== '') <a href="{{ route('admin.users') }}">Clear</a> @endif
        </form>

        <div class="scroll">
        <table>
            <thead><tr><th>User</th><th>Sign-in</th><th>Role</th><th>Status</th><th>Designs</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
            @forelse ($users as $u)
                <tr>
                    <td>
                        @if ($u->avatar)<img class="avatar" src="{{ $u->avatar }}" alt="" referrerpolicy="no-referrer">@endif
                        <strong>{{ $u->name }}</strong><br><span class="muted">{{ $u->email }}@if ($u->username) &middot; {{ $u->username }}@endif</span>
                    </td>
                    <td class="muted">{{ $u->password ? 'Password' : '' }}{{ $u->password && $u->google_id ? ' + ' : '' }}{{ $u->google_id ? 'Google' : '' }}</td>
                    <td><span class="badge {{ $u->role }}">{{ $u->role === 'admin' ? 'Admin' : 'End user' }}</span></td>
                    <td><span class="badge {{ $u->status }}">{{ ucfirst($u->status) }}</span></td>
                    <td>{{ $u->designs_count }}</td>
                    <td>{{ $u->created_at?->format('Y-m-d') }}</td>
                    <td>
                        <details class="pw">
                            <summary>Set password</summary>
                            <form method="post" action="/admin/users/{{ $u->id }}/password" autocomplete="off">@csrf
                                <input type="password" name="password" required minlength="8" maxlength="72" placeholder="New password" autocomplete="new-password" aria-label="New password for {{ $u->email }}">
                                <button class="btn small" type="submit">Save</button>
                            </form>
                        </details>
                        @if ($u->is($me))
                            <span class="muted">You</span>
                        @else
                            <form class="inline" method="post" action="/admin/users/{{ $u->id }}/role">@csrf
                                <input type="hidden" name="role" value="{{ $u->isAdmin() ? 'user' : 'admin' }}">
                                <button class="btn secondary small" type="submit"
                                    @if (! $u->isAdmin()) onclick="return confirm('Make {{ e($u->email) }} an administrator?')" @endif>
                                    {{ $u->isAdmin() ? 'Make end user' : 'Make admin' }}</button>
                            </form>
                            <form class="inline" method="post" action="/admin/users/{{ $u->id }}/status">@csrf
                                <input type="hidden" name="status" value="{{ $u->status === 'enabled' ? 'disabled' : 'enabled' }}">
                                <button class="btn secondary small" type="submit"
                                    @if ($u->status === 'enabled') onclick="return confirm('Disable {{ e($u->email) }}? They are signed out on their next request.')" @endif>
                                    {{ $u->status === 'enabled' ? 'Disable' : 'Enable' }}</button>
                            </form>
                        @endif
                    </td>
                </tr>
            @empty
                <tr><td colspan="7" class="muted">No users match.</td></tr>
            @endforelse
            </tbody>
        </table>
        </div>

        <div class="pager">
            @if ($users->previousPageUrl()) <a href="{{ $users->previousPageUrl() }}">&larr; Newer</a> @endif
            @if ($users->nextPageUrl()) <a href="{{ $users->nextPageUrl() }}">Older &rarr;</a> @endif
        </div>
    </main>
</div>
@include('partials.footer')
</body>
</html>
