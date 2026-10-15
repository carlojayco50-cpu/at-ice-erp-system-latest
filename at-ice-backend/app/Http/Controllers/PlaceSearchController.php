<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

// Map lookups for the Add/Edit Customer form (Admin):
// - reverse: the address under the Grab-style map pin.
// - fromLink: the pin and address from a pasted Google Maps link.
// Addresses come from OpenStreetMap's Nominatim (free, no key), sent with the
// User-Agent its usage policy asks for, and cached.
class PlaceSearchController extends Controller
{
    private const USER_AGENT = 'AT-ICE-ERP/1.0 (STI SJDM Capstone Project)';

    // GET /api/places/reverse?lat=14.73&lng=121.04[&with_name=1]
    // Name of the spot under the pin, e.g. "Makabud Street, Novaliches", plus
    // its address split into the form's fields. With with_name=1 (coordinates
    // pasted in Map Link) it also gives the nearest store's name and the other
    // stores at the pin (`nearby`).
    public function reverse(Request $request)
    {
        $request->validate([
            'lat' => 'required|numeric|between:-90,90',
            'lng' => 'required|numeric|between:-180,180',
            'with_name' => 'nullable|boolean',
        ]);
        $lat = (float) $request->lat;
        $lng = (float) $request->lng;

        $place = $this->lookUp($lat, $lng) ?? ['label' => '', 'address' => null];
        if ($request->boolean('with_name')) {
            $nearby = $this->storesNear($lat, $lng);
            $place += ['name' => $nearby[0] ?? '', 'nearby' => $nearby];
        }

        return response()->json($place);
    }

    // GET /api/places/from-link?url=https://maps.app.goo.gl/...
    // Reads the pin from a Google Maps link (short maps.app.goo.gl links are
    // followed to the full link, only ever to Google hosts) and returns it
    // with the place name and the address there.
    public function fromLink(Request $request)
    {
        $request->validate(['url' => 'required|string|max:2000']);
        $url = trim($request->url);

        $full = $this->expandGoogleLink($url);
        if ($full === null) {
            return response()->json(['message' => 'Paste a Google Maps link, e.g. https://maps.app.goo.gl/...'], 422);
        }

        $pin = $this->pinFromGoogleUrl($full);
        if ($pin === null) {
            return response()->json(['message' => 'That link has no map pin. In Google Maps, open the store, click Share, then copy the link.'], 422);
        }

        $place = $this->lookUp($pin['latitude'], $pin['longitude']);
        // A link with only coordinates (?q=14.77,121.07) has no name: use the nearest store.
        $name = $this->placeNameFromGoogleUrl($full) ?: ($this->storesNear($pin['latitude'], $pin['longitude'])[0] ?? '');

        return response()->json($pin + [
            'name' => $name,
            'label' => $place['label'] ?? '',
            'address' => $place['address'] ?? null,
        ]);
    }

    private function isGoogleMapsUrl(string $url): bool
    {
        $parts = parse_url($url);
        if (! $parts || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
            return false;
        }
        $host = strtolower($parts['host'] ?? '');
        $path = $parts['path'] ?? '';

        return $host === 'maps.app.goo.gl'
            || ($host === 'goo.gl' && str_starts_with($path, '/maps'))
            || ($host === 'maps.google.com' || preg_match('/^maps\.google\.[a-z.]+$/', $host))
            || (preg_match('/^(www\.)?google\.[a-z.]+$/', $host) && str_starts_with($path, '/maps'));
    }

    // Full Google Maps URL for a link, following short-link redirects (Google hosts only).
    private function expandGoogleLink(string $url): ?string
    {
        if (! preg_match('#^https?://#i', $url)) {
            $url = 'https://'.$url;
        }

        for ($hop = 0; $hop < 5; $hop++) {
            if (! $this->isGoogleMapsUrl($url)) {
                return null;
            }
            $host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
            if ($host !== 'maps.app.goo.gl' && $host !== 'goo.gl') {
                return $url;
            }
            try {
                $response = Http::timeout(8)->withOptions(['allow_redirects' => false])
                    ->withHeaders(['User-Agent' => 'Mozilla/5.0'])->get($url);
            } catch (Throwable) {
                return null;
            }
            $next = $response->header('Location');
            if (! $next) {
                return null;
            }
            $url = $next;
        }

        return null;
    }

    // The place's own pin (!3d..!4d..) wins over the map view (@lat,lng) and q=lat,lng.
    private function pinFromGoogleUrl(string $url): ?array
    {
        $url = urldecode($url);
        $patterns = [
            '/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/',
            '/[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/',
            '#/place/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)#',
            '/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $url, $m)) {
                $lat = (float) $m[1];
                $lng = (float) $m[2];
                if ($lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180) {
                    return ['latitude' => round($lat, 7), 'longitude' => round($lng, 7)];
                }
            }
        }

        return null;
    }

    // "Alfamart Amparo Subdivision" from .../maps/place/Alfamart+Amparo+Subdivision/@...
    private function placeNameFromGoogleUrl(string $url): string
    {
        if (! preg_match('#/maps/place/([^/@?]+)#', $url, $m)) {
            return '';
        }
        $name = trim(urldecode(str_replace('+', ' ', $m[1])));

        return preg_match('/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/', $name) ? '' : $name;
    }

    // Not stores: never offered as the branch name.
    private const NOT_STORES = [
        'parking', 'parking_entrance', 'parking_space', 'bicycle_parking', 'motorcycle_parking', 'toilets', 'bench',
        'waste_basket', 'waste_disposal', 'recycling', 'shelter', 'atm', 'telephone', 'vending_machine', 'drinking_water',
    ];

    // Names of the stores within 60 m of a spot, nearest first (Photon, OpenStreetMap
    // data, free, no key), cached for a week. Empty when there are none or Photon fails.
    private function storesNear(float $lat, float $lng): array
    {
        $lat = round($lat, 5);
        $lng = round($lng, 5);

        $key = "places:near1:$lat,$lng";
        if (Cache::has($key)) {
            return Cache::get($key);
        }

        try {
            $response = Http::timeout(8)
                ->withHeaders(['User-Agent' => self::USER_AGENT])
                ->get('https://photon.komoot.io/reverse?'.http_build_query(['lat' => $lat, 'lon' => $lng, 'limit' => 8, 'radius' => 0.06])
                    .'&osm_tag=shop&osm_tag=amenity&osm_tag=office');
        } catch (Throwable) {
            return [];
        }
        if (! $response->ok()) {
            return [];
        }

        $names = collect($response->json('features') ?? [])
            ->reject(fn ($f) => in_array($f['properties']['osm_value'] ?? '', self::NOT_STORES, true))
            ->pluck('properties.name')
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->values()
            ->take(5)
            ->all();
        Cache::put($key, $names, now()->addWeek());

        return $names;
    }

    // Label and address fields at a spot, cached for a week. Null when OpenStreetMap fails.
    private function lookUp(float $lat, float $lng): ?array
    {
        $lat = round($lat, 5);
        $lng = round($lng, 5);
        $key = "places:rev2:$lat,$lng";

        $place = Cache::remember($key, now()->addWeek(), function () use ($lat, $lng) {
            try {
                $response = Http::timeout(8)
                    ->withHeaders(['User-Agent' => self::USER_AGENT])
                    ->get('https://nominatim.openstreetmap.org/reverse', [
                        'lat' => $lat, 'lon' => $lng, 'format' => 'jsonv2', 'zoom' => 18, 'addressdetails' => 1,
                    ]);
            } catch (Throwable) {
                return null;
            }
            if (! $response->ok() || isset($response['error'])) {
                return null;
            }

            return $this->fromNominatim($response->json());
        });

        if ($place === null) {
            Cache::forget($key);
        }

        return $place;
    }

    // One Nominatim reverse result as a short label and the form's address fields.
    private function fromNominatim(array $r): array
    {
        $a = $r['address'] ?? [];
        $street = trim(implode(' ', array_filter([$a['house_number'] ?? null, $a['road'] ?? null])));
        $subdivision = $a['residential'] ?? ($a['neighbourhood'] ?? '');
        $barangay = $a['quarter'] ?? ($a['suburb'] ?? ($a['village'] ?? ''));
        $city = $a['city'] ?? ($a['town'] ?? ($a['municipality'] ?? ''));
        // NCR has no province on OpenStreetMap, only "Northern Manila District" and the like.
        $ncr = str_contains($a['state'] ?? '', 'Metro Manila') || str_contains($a['region'] ?? '', 'Metro Manila')
            || str_contains($a['state_district'] ?? '', 'Manila District');
        $province = $a['province'] ?? ($ncr ? 'Metro Manila' : ($a['state_district'] ?? ($a['county'] ?? ($a['state'] ?? ''))));

        $spot = ($r['name'] ?? '') ?: ($street ?: $subdivision);

        return [
            'label' => implode(', ', array_unique(array_filter([$spot, $barangay ?: $city]))),
            'address' => [
                'street' => $street,
                'subdivision' => $subdivision,
                'barangay' => $barangay,
                'city' => $city,
                'province' => $province,
                'postal_code' => preg_match('/^\d{4}$/', $a['postcode'] ?? '') ? $a['postcode'] : '',
            ],
        ];
    }
}
