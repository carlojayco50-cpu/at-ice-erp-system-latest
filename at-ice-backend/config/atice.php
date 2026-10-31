<?php

return [

    // Most of one product (bags, small sacks or big sacks) on a single delivery,
    // loading count or confirmation. One value for New Delivery, Ice Loading and
    // the Salesman's confirmation; the web app reads it from GET /api/limits.
    'max_product_quantity' => (int) env('MAX_PRODUCT_QUANTITY', 500),

    // Times typed into forms without a zone (e.g. Ice Loading "Loaded At") are
    // in this zone; "today" for the Ice Loading delivery list follows it too.
    'timezone' => env('ATICE_TIMEZONE', 'Asia/Manila'),

    // Sign-in lockout (App\Services\LoginLockout). Every `threshold` wrong
    // passwords in a row lock one email from one IP for the next step of `steps`
    // (seconds): 3, 5, 10, 15, 30 then 60 minutes, and 60 stays the cap. The step
    // count is forgotten after `memory` seconds without a failure, or on a
    // successful sign-in. Two wider nets catch guessing that spreads out: the same
    // email from many IPs, and one IP trying many emails. They have higher limits
    // and short locks, so nobody can lock an employee out for long.
    'login_lockout' => [
        'threshold' => (int) env('LOGIN_LOCKOUT_THRESHOLD', 5),
        'steps' => [180, 300, 600, 900, 1800, 3600],
        'memory' => 86400,
        'account' => ['failures' => 20, 'window' => 3600, 'lock' => 900],
        'ip' => ['failures' => 40, 'window' => 900, 'lock' => 900],
    ],

];
