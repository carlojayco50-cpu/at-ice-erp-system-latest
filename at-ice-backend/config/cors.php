<?php

// Which websites may call this API from a browser.
// Set CORS_ALLOWED_ORIGINS in .env as a comma separated list, for example:
//   Local:   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
//   Railway: CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
// Without this file Laravel 11 allows every origin (*).

return [

    'paths' => ['api/*', 'broadcasting/auth'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Bearer tokens are used, not cookies
    'supports_credentials' => false,

];
