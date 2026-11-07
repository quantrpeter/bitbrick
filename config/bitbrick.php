<?php

return [
    // Webpack dev server used by the side-loading view in local development.
    'dev_server' => env('BITBRICK_DEV_SERVER', 'http://localhost:8095'),

    // Optional private-beta restriction: comma separated list of e-mail domains
    // that may sign in. Empty means everyone with a Google account.
    'allowed_domains' => array_values(array_filter(array_map(
        fn ($d) => strtolower(trim($d)),
        explode(',', (string) env('BITBRICK_ALLOWED_DOMAINS', ''))
    ))),

    // E-mail addresses that are always administrators. They are promoted when they sign in with
    // Google (the address must be verified by Google), so this list is how the first admin is created.
    'admin_emails' => array_values(array_filter(array_map(
        fn ($e) => strtolower(trim($e)),
        explode(',', (string) env('BITBRICK_ADMIN_EMAILS', ''))
    ))),

    // Password for the seeded administrator (peter@quantr.hk). Read by `php artisan db:seed` only;
    // keep it in .env / .env.prod, never in source control. Empty = leave the password untouched.
    'admin_password' => env('BITBRICK_ADMIN_PASSWORD'),

    // Limits for a saved design.
    'max_blocks' => 5000,
    'max_designs_per_user' => 200,
];
