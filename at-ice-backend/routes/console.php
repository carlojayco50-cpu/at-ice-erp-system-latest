<?php

use App\Support\ArchiveExpiry;
use App\Support\DeliveryDispatch;
use App\Support\LiveFeed;
use App\Support\MemoEngine;
use App\Support\PayrollCalendar;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Time-based work, every minute, so it runs even when nobody has the app open
// (the `scheduler` service in docker-compose.yml runs `php artisan
// schedule:work`). Each job keeps its own spacing and lock (dispatch at most
// every 15 s, memos every 10 min, cut-off once per period, archive once a
// day), so the live-feed poll can still trigger them as a fallback.
Schedule::call(function () {
    LiveFeed::$fromScheduler = true;
    DeliveryDispatch::run();   // off drivers' stops reassigned, queue, delay notices
    MemoEngine::run();         // missed Time Outs -> draft memos
    PayrollCalendar::notifyCutoff();
    ArchiveExpiry::daily();
})->everyMinute()->name('atice-background')->withoutOverlapping();
