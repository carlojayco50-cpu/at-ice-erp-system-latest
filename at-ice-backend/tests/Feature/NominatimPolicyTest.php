<?php

namespace Tests\Feature;

use App\Services\GeocodingService;
use App\Services\Nominatim;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// OpenStreetMap's Nominatim usage policy: a User-Agent that names the app,
// at most 1 request per second in total, and no repeat lookups.
class NominatimPolicyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
    }

    public function test_requests_send_the_configured_user_agent(): void
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([['lat' => '14.8', 'lon' => '121.0']])]);

        GeocodingService::geocode('Main St', 'San Jose del Monte', 'Bulacan');

        $agent = config('services.nominatim.user_agent');
        $this->assertStringContainsString('contact:', $agent);
        Http::assertSent(fn (Request $r) => $r->header('User-Agent') === [$agent]);
    }

    public function test_the_same_address_is_looked_up_once(): void
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([['lat' => '14.8', 'lon' => '121.0']])]);

        $first = GeocodingService::geocode('Main St', 'San Jose del Monte', 'Bulacan');
        $again = GeocodingService::geocode('  main st ', 'SAN JOSE DEL MONTE', 'Bulacan');

        $this->assertSame(['latitude' => 14.8, 'longitude' => 121.0], $first);
        $this->assertSame($first, $again);
        Http::assertSentCount(1);
    }

    public function test_failed_lookups_are_not_cached(): void
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([])]);

        GeocodingService::geocode('Nowhere St', 'Nowhere', 'Nowhere');
        GeocodingService::geocode('Nowhere St', 'Nowhere', 'Nowhere');

        Http::assertSentCount(2);
    }

    public function test_a_pin_is_never_made_from_only_a_city_or_province(): void
    {
        // every lookup would find a spot, so any request made would give a pin
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([['lat' => '14.8', 'lon' => '121.0']])]);

        $this->assertNull(GeocodingService::geocode('', 'San Jose del Monte', 'Bulacan'));
        Http::assertNothingSent();
    }

    public function test_a_street_that_is_not_found_does_not_fall_back_to_the_city_centre(): void
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([])]);

        $this->assertNull(GeocodingService::geocode('Unreal St', 'San Jose del Monte', 'Bulacan'));
        Http::assertSentCount(1);
    }

    public function test_requests_are_at_least_a_second_apart(): void
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([])]);

        Nominatim::get('search', ['q' => 'a']);
        $start = microtime(true);
        Nominatim::get('search', ['q' => 'b']);

        $this->assertGreaterThanOrEqual(0.9, microtime(true) - $start);
    }
}
