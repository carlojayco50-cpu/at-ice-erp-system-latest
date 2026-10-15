<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

// The one way to call OpenStreetMap's Nominatim. Its usage policy asks for a
// descriptive User-Agent and at most 1 request per second in total, so every
// request goes through a lock kept in the cache store: all users and processes
// share it, and each request starts at least a second after the last one.
// https://operations.osmfoundation.org/policies/nominatim/
class Nominatim
{
    private const GAP = 1.1; // seconds between requests

    private const LOCK_WAIT = 20; // seconds to wait for our turn

    // GET https://nominatim.openstreetmap.org/{search|reverse}. Throws on a
    // connection failure or when our turn does not come.
    public static function get(string $path, array $query): Response
    {
        return Cache::lock('nominatim:gate', 30)->block(self::LOCK_WAIT, function () use ($path, $query) {
            $wait = (float) Cache::get('nominatim:last', 0) + self::GAP - microtime(true);
            if ($wait > 0) {
                usleep((int) ($wait * 1_000_000));
            }

            try {
                return Http::timeout(8)
                    ->withHeaders(['User-Agent' => config('services.nominatim.user_agent')])
                    ->get("https://nominatim.openstreetmap.org/$path", $query);
            } finally {
                Cache::put('nominatim:last', microtime(true), 60);
            }
        });
    }
}
