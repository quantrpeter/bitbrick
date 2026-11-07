<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BitBrick - Log in</title>
    <meta name="description" content="Design custom pin-and-axle building parts in your browser and export them for 3D printing.">
    <link rel="preload" as="image" href="/images/login-bg.webp">
    <style>
        :root { --navy: #14233f; --navy-2: #1d3361; --yellow: #ffc800; --yellow-2: #e6b400; --ink: #101828; --muted: #5b6575; --line: #cfd5df; --blue: #0b4bd8; }
        * { box-sizing: border-box; }
        html, body { margin: 0; min-height: 100%; }
        body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: #fff; background: var(--navy); }

        /* The background is anchored left so the empty wall stays behind the text, as in the design mockup. */
        .hero {
            min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 33vw); align-items: center; column-gap: 3vw;
            padding: 0 3.4vw 0 3.3vw;
            background: url("/images/login-bg.webp") left center / cover no-repeat, var(--navy);
        }
        .pitch { align-self: start; padding-top: 16vh; max-width: 26vw; }
        .pitch h1 { margin: 0; font-size: clamp(2rem, 3.35vw, 4.2rem); line-height: 1.06; letter-spacing: -.02em; font-weight: 800; text-shadow: 0 2px 16px rgba(0,0,0,.35); }
        .pitch h1 span { color: var(--yellow); display: block; }
        .pitch .rule { width: 3.4vw; min-width: 44px; height: 5px; background: var(--yellow); border-radius: 3px; margin: 1.8vw 0 1.4vw; }
        .pitch p { margin: 0; font-size: clamp(.95rem, 1.2vw, 1.3rem); text-shadow: 0 1px 10px rgba(0,0,0,.45); }
        .features { display: flex; gap: .6vw; margin: 2.2vw 0 0; padding: 0; list-style: none; }
        .features li { width: 5.4vw; min-width: 88px; padding: 14px 6px 10px; text-align: center; font-size: clamp(11px, .85vw, 14px); line-height: 1.25;
            background: rgba(20,35,63,.62); border: 1px solid rgba(255,255,255,.28); border-radius: 16px; backdrop-filter: blur(4px); }
        .features svg { display: block; margin: 0 auto 8px; width: 34px; height: 34px; stroke: #fff; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

        .card { justify-self: stretch; width: 100%; max-width: 520px; margin-left: auto; background: #fff; color: var(--ink); border-radius: 28px; padding: clamp(24px, 3.4vw, 44px); box-shadow: 0 24px 70px rgba(5,12,30,.45); }
        .brand { display: flex; align-items: center; justify-content: center; gap: 14px; }
        .brand svg { width: 84px; height: auto; flex: none; }
        .brand b { font-size: clamp(2.2rem, 3.4vw, 3.2rem); line-height: 1; letter-spacing: -.02em; color: var(--navy); font-weight: 800; }
        .tagline { margin: 6px 0 0; text-align: center; color: var(--muted); font-size: 1.1rem; }
        h2 { margin: 30px 0 18px; font-size: 1.9rem; line-height: 1.1; }

        .error { background: #fde8e8; color: #8a1c1c; border-radius: 10px; padding: 10px 14px; margin: 0 0 16px; font-size: 15px; }
        .btn { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; padding: 15px 18px; border-radius: 999px; font: inherit; font-size: 1.15rem; font-weight: 700; text-decoration: none; cursor: pointer; border: 2px solid transparent; }
        .btn.primary { background: var(--yellow); color: var(--navy); }
        .btn.primary:hover { background: var(--yellow-2); }
        .btn.outline { background: #fff; color: var(--ink); border-color: #8c9ab5; }
        .btn.outline:hover { background: #f1f5ff; }
        .btn:focus-visible { outline: 3px solid var(--blue); outline-offset: 3px; }
        .g { width: 26px; height: 26px; background: #fff; border-radius: 50%; padding: 3px; flex: none; }

        form { margin: 0; }
        .field { position: relative; display: block; margin: 0 0 14px; }
        .field > svg.ico { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; stroke: #5b6575; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
        .field input { width: 100%; padding: 15px 52px 15px 54px; border: 2px solid var(--line); border-radius: 999px; font: inherit; font-size: 1.05rem; color: var(--ink); background: #fff; }
        .field input::placeholder { color: #7b8494; }
        .field input:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(11,75,216,.18); }
        .field input[aria-invalid="true"] { border-color: #c0392b; }
        .eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border: 0; background: none; border-radius: 50%; cursor: pointer; padding: 8px; }
        .eye svg { width: 22px; height: 22px; stroke: #5b6575; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
        .eye:focus-visible { outline: 3px solid var(--blue); }
        .remember { display: flex; align-items: center; gap: 10px; margin: 2px 0 20px; font-size: 1rem; cursor: pointer; }
        .remember input { width: 20px; height: 20px; accent-color: var(--navy-2); }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .divider { display: flex; align-items: center; gap: 14px; margin: 26px 0 18px; color: var(--muted); font-size: .95rem; }
        .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
        .note { margin: 18px 0 0; color: var(--muted); font-size: .85rem; text-align: center; }

        @media (max-width: 1100px) {
            .hero { grid-template-columns: 1fr; align-content: center; padding: 28px 16px; background-position: 38% center; }
            .hero::before { content: ""; position: fixed; inset: 0; background: rgba(12,22,44,.55); z-index: 0; }
            .pitch, .card { position: relative; z-index: 1; }
            .pitch { max-width: 520px; padding-top: 0; margin: 0 auto; width: 100%; }
            .pitch h1 { font-size: 2.3rem; }
            .pitch h1 br { display: none; }
            .pitch .rule { width: 56px; margin: 16px 0 14px; }
            .pitch p { font-size: 1rem; }
            .features { display: none; }
            .card { margin: 0 auto; }
        }
    </style>
</head>
<body>
<div class="hero">
    <section class="pitch" aria-label="About BitBrick">
        <h1>Design<br>Brick Parts <span>Your Way</span></h1>
        <div class="rule"></div>
        <p>BitBrick is a web portal to design, customize and create pin-and-axle building parts, then print them on your own 3D printer.</p>
        <ul class="features">
            <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>
                Design<br>Bricks
            </li>
            <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h10M17 7h4M3 17h4M11 17h10"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
                Customize<br>Dimensions
            </li>
            <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10.5l5 5 5-5M4 20h16"/></svg>
                Export<br>&amp; Share
            </li>
        </ul>
    </section>

    <main class="card">
        <div class="brand">
            <svg viewBox="0 0 96 48" aria-hidden="true">
                <g transform="rotate(-18 48 24)">
                    <rect x="6" y="9" width="84" height="30" rx="15" fill="#ffc800" stroke="#14233f" stroke-width="4"/>
                    <circle cx="25" cy="24" r="5.5" fill="#14233f"/><circle cx="41" cy="24" r="5.5" fill="#14233f"/>
                    <circle cx="57" cy="24" r="5.5" fill="#14233f"/><circle cx="73" cy="24" r="5.5" fill="#14233f"/>
                </g>
            </svg>
            <b>BitBrick</b>
        </div>
        <p class="tagline">Brick Design Portal</p>

        <h2>Log In</h2>

        @if ($errors->any())
            <div class="error" role="alert" id="login-error">{{ $errors->first() }}</div>
        @endif

        <form method="post" action="/">
            @csrf
            <label class="field">
                <span class="sr-only">E-mail or username</span>
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/></svg>
                <input type="text" name="login" value="{{ old('login') }}" placeholder="E-mail or username" autocomplete="username"
                       autocapitalize="none" spellcheck="false" required maxlength="255" autofocus
                       @if ($errors->any()) aria-invalid="true" aria-describedby="login-error" @endif>
            </label>
            <label class="field">
                <span class="sr-only">Password</span>
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>
                <input type="password" id="password" name="password" placeholder="Password" autocomplete="current-password" required maxlength="255"
                       @if ($errors->any()) aria-invalid="true" aria-describedby="login-error" @endif>
                <button type="button" class="eye" id="toggle-password" aria-label="Show password" aria-pressed="false">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </label>
            <label class="remember"><input type="checkbox" name="remember" value="1" @checked(old('remember'))> Remember me</label>
            <button class="btn primary" type="submit">Log In</button>
        </form>

        <div class="divider"><span>or</span></div>

        <a class="btn outline" href="{{ route('auth.google') }}">
            <svg class="g" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
                <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/>
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
            </svg>
            Continue with Google
        </a>

        <p class="note">Sign-in is required to use BitBrick. New with Google? Your account is created automatically. Forgot your password? Ask an administrator.</p>
        <p class="note">BitBrick is an independent project and is not affiliated with any brand owner.</p>
    </main>
</div>
<script>
    (function () {
        // A share link such as /designer#part=... loses its fragment while Google sign-in round-trips,
        // so park it for this tab; the designer picks it up after login.
        try {
            if (location.hash.indexOf('#part=') === 0) sessionStorage.setItem('bitbrick.pendingHash', location.hash);
        } catch (e) { /* storage blocked: the link just opens an empty designer */ }

        var input = document.getElementById('password');
        var btn = document.getElementById('toggle-password');
        btn.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.setAttribute('aria-pressed', show ? 'true' : 'false');
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    })();
</script>
</body>
</html>
