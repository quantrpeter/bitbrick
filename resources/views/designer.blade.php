<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>BitBrick Designer</title>
    <style>
        html,body,#main{height:100%;margin:0}
        .dev-badge{position:fixed;top:4px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:2px 12px;background:rgba(120,25,40,.85);
            color:#fff;border:1.5px solid #e0556a;border-radius:999px;font:600 12px system-ui,sans-serif;z-index:1500;pointer-events:none}
        .dev-badge span{width:9px;height:9px}
        @media (max-width:900px){.dev-badge{top:auto;bottom:6px;left:auto;right:10px;transform:none}}
    </style>
    <script>window.__BITBRICK__ = {{ Illuminate\Support\Js::from($boot) }};</script>
</head>
<body>
<div id="main"></div>

{{-- Side-loading: in local development try the webpack dev server first (cd designer && npm start),
     and fall back to the production bundle on disk. The dev probe is skipped outside the local
     environment so a visitor's own localhost can never inject script into the page. --}}
@php
    $bundle = public_path('designer-production/bundle.js');
    $bundleUrl = '/designer-production/bundle.js?v='.(is_file($bundle) ? filemtime($bundle) : 0);
@endphp
<script>
    (function () {
        function loadProduction() {
            var s = document.createElement('script');
            s.defer = true;
            s.src = @json($bundleUrl);
            s.onerror = function () {
                document.getElementById('main').textContent =
                    'The designer bundle is missing. Run "npm run build" in the designer folder.';
            };
            document.head.appendChild(s);
        }
        @if (app()->environment('local'))
        var dev = document.createElement('script');
        dev.defer = true;
        dev.src = @json(rtrim(config('bitbrick.dev_server'), '/').'/bundle.js?'.time());
        dev.onload = function () {
            var badge = document.createElement('div');
            badge.innerHTML = '<span style="border-radius:50%;background:#2ee05a;display:inline-block"></span>Dev server';
            badge.className = 'dev-badge';
            badge.setAttribute('role', 'status');
            document.body.appendChild(badge);
        };
        dev.onerror = loadProduction;
        document.head.appendChild(dev);
        @else
        loadProduction();
        @endif
    })();
</script>
</body>
</html>
