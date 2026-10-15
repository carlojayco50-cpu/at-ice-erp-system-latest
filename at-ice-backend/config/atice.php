<?php

return [

    // Most of one product (bags, small sacks or big sacks) on a single delivery,
    // loading count or confirmation. One value for New Delivery, Ice Loading and
    // the Salesman's confirmation; the web app reads it from GET /api/limits.
    'max_product_quantity' => (int) env('MAX_PRODUCT_QUANTITY', 500),

    // Times typed into forms without a zone (e.g. Ice Loading "Loaded At") are
    // in this zone; "today" for the Ice Loading delivery list follows it too.
    'timezone' => env('ATICE_TIMEZONE', 'Asia/Manila'),

];
