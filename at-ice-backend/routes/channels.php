<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('attendance', function () {
    return true;
});

Broadcast::channel('inventory', function () {
    return true;
});

Broadcast::channel('payments', function () {
    return true;
});

Broadcast::channel('deliveries', function () {
    return true;
});
