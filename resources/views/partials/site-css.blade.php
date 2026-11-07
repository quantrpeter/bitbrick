<style>
    :root { --bg:#f4f5f7; --fg:#1b1f24; --muted:#5b6470; --card:#fff; --line:#d9dde3; --brand:#2f5fd3; --brand-fg:#fff; }
    @media (prefers-color-scheme: dark) {
        :root { --bg:#14171b; --fg:#e8eaed; --muted:#9aa3ad; --card:#1d2227; --line:#2c333a; --brand:#6d94f5; --brand-fg:#0d1117; }
    }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--fg); }
    .wrap { max-width:880px; margin:0 auto; padding:0 16px; }
    header.site { display:flex; justify-content:space-between; align-items:center; padding:16px 0; }
    header.site a.logo { font-weight:700; font-size:20px; color:inherit; text-decoration:none; }
    .btn { display:inline-flex; align-items:center; gap:8px; padding:10px 18px; border-radius:8px; border:1px solid var(--brand);
           background:var(--brand); color:var(--brand-fg); text-decoration:none; font-weight:600; cursor:pointer; font-size:15px; }
    .btn.secondary { background:transparent; color:var(--brand); }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:24px; }
    .muted { color:var(--muted); }
    .error { background:#fde8e8; color:#8a1c1c; border-radius:8px; padding:10px 14px; margin-bottom:16px; }
    footer.site { padding:32px 0; color:var(--muted); font-size:13px; text-align:center; }
</style>
