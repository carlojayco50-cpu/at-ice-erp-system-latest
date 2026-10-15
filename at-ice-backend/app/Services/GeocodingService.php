<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class GeocodingService
{
    // Uses OpenStreetMap's Nominatim — free, no API key required.
    // User-Agent and the 1 request/sec limit are handled in App\Services\Nominatim.
    public static function geocode(string $address, string $city, string $province, string $barangay = ''): ?array
    {
        // A street or barangay is needed. City and province alone give no usable pin.
        if (trim($address) === '' && trim($barangay) === '') {
            return null;
        }

        // First attempt: full address (most precise).
        $result = self::attempt([trim($address), trim($barangay), trim($city), trim($province)]);
        if ($result) {
            return $result;
        }

        // Second attempt: barangay, when the street itself is not on the map.
        if (trim($barangay) !== '' && trim($address) !== '') {
            Log::info("Geocoding: full address failed, retrying with barangay for: {$barangay}, {$city}");
            $result = self::attempt([trim($barangay), trim($city), trim($province)]);
            if ($result) {
                return $result;
            }
        }

        // Never a pin from only a city or province: that is not a place to deliver to.
        return null;
    }

    private static function attempt(array $addressParts): ?array
    {
        $parts = array_filter(
            array_merge($addressParts, ['Philippines']),
            fn ($part) => $part !== ''
        );
        $query = implode(', ', $parts);

        // Same address, same pin: only found pins are kept, never failures.
        $key = 'geocode:v1:'.sha1(mb_strtolower(preg_replace('/\s+/', ' ', $query)));
        if ($cached = Cache::get($key)) {
            return $cached;
        }

        try {
            $response = Nominatim::get('search', [
                'q' => $query,
                'format' => 'json',
                'limit' => 1,
                'countrycodes' => 'ph',
            ]);

            if (! $response->ok()) {
                Log::warning("Geocoding failed (HTTP {$response->status()}) for: {$query}");

                return null;
            }

            $results = $response->json();

            if (empty($results)) {
                Log::warning("Geocoding found no results for: {$query}");

                return null;
            }

            $pin = [
                'latitude' => (float) $results[0]['lat'],
                'longitude' => (float) $results[0]['lon'],
            ];
            Cache::put($key, $pin, now()->addDays(30));

            return $pin;
        } catch (\Exception $e) {
            Log::error("Geocoding exception for '{$query}': ".$e->getMessage());

            return null;
        }
    }
}
