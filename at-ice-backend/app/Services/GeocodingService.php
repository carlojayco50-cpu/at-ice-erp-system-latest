<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeocodingService
{
    // Uses OpenStreetMap's Nominatim — free, no API key required.
    // Usage policy requires a descriptive User-Agent and max ~1 request/sec:
    // https://operations.osmfoundation.org/policies/nominatim/
    public static function geocode(string $address, string $city, string $province, string $barangay = ''): ?array
    {
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

        // Fallback: some records have a placeholder/unreal street address
        // (e.g. "Fahrenheit, San Jose del Monte") that Nominatim can never
        // resolve. Retry with just city + province so we at least get an
        // approximate (city-center) pin instead of nothing.
        if (trim($address) !== '' || trim($barangay) !== '') {
            Log::info("Geocoding: retrying with city/province only for: {$city}, {$province}");
            $result = self::attempt([trim($city), trim($province)]);
        }

        return $result;
    }

    private static function attempt(array $addressParts): ?array
    {
        $parts = array_filter(
            array_merge($addressParts, ['Philippines']),
            fn ($part) => $part !== ''
        );
        $query = implode(', ', $parts);

        try {
            $response = Http::withHeaders([
                'User-Agent' => 'AT-ICE-ERP/1.0 (STI SJDM Capstone Project)',
            ])->get('https://nominatim.openstreetmap.org/search', [
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

            return [
                'latitude' => (float) $results[0]['lat'],
                'longitude' => (float) $results[0]['lon'],
            ];
        } catch (\Exception $e) {
            Log::error("Geocoding exception for '{$query}': ".$e->getMessage());

            return null;
        }
    }
}
