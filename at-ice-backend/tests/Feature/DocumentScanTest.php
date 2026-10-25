<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentScanTest extends TestCase
{
    use RefreshDatabase;

    private const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';

    protected function setUp(): void
    {
        parent::setUp();
        // Never call the real Groq API from a test.
        Http::preventStrayRequests();
    }

    public function test_the_license_number_is_read_and_a_rate_limit_is_explained(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        config(['services.groq.key' => 'test-key']);
        Http::fake(['api.groq.com/*' => Http::sequence()
            ->push(['choices' => [['message' => ['content' => '{"document_type": "drivers_license", "first_name": "Pedro", "last_name": "Santos", "license_number": "N01 23 456789", "license_expiry": "2030-05-17"}']]]])
            ->push(['error' => ['message' => 'Rate limit reached. Please try again in 20.62s.']], 429)]);

        $this->postJson('/api/scan-document', ['kind' => 'license', 'image' => self::IMAGE])
            ->assertOk()
            ->assertJsonPath('person.license_number', 'N01-23-456789')
            ->assertJsonPath('person.license_expiry', '2030-05-17');

        $this->postJson('/api/scan-document', ['kind' => 'license', 'image' => self::IMAGE])
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many scans in the last minute. Try again in 21 seconds.');
    }

    private function groqReplies(string $content): void
    {
        config(['services.groq.key' => 'test-key']);
        Http::fake(['api.groq.com/*' => Http::response(['choices' => [['message' => ['content' => $content]]]])]);
    }

    public function test_hr_gets_the_name_mobile_and_address(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies(json_encode([
            'first_name' => 'JUAN CARLO', 'middle_name' => 'SANTOS', 'last_name' => 'DELA CRUZ', 'suffix' => 'JR',
            'mobile' => '0917 123 4567', 'email' => 'Juan@Example.com',
            'block_lot' => 'BLK 63 LOT 4', 'street' => 'ANUBING ST', 'subdivision' => 'Amparo Subdivision',
            'barangay' => 'Brgy. 179', 'city' => 'CALOOCAN CITY', 'province' => 'Metro Manila', 'postal_code' => '1425',
        ]));

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => self::IMAGE])
            ->assertOk()
            ->assertJsonPath('person.first_name', 'Juan Carlo')
            ->assertJsonPath('person.middle_initial', 'S')
            ->assertJsonPath('person.last_name', 'Dela Cruz')
            ->assertJsonPath('person.suffix', 'Jr.')
            ->assertJsonPath('person.phone', '9171234567')
            ->assertJsonPath('person.email', 'juan@example.com')
            ->assertJsonPath('address.street', 'Anubing St')
            ->assertJsonPath('address.subdivision', 'Amparo Subdivision')
            ->assertJsonPath('address.barangay', '179')
            ->assertJsonPath('address.city', 'Caloocan City')
            ->assertJsonPath('address.postal_code', '1425');

        Http::assertSent(fn ($req) => $req['messages'][0]['content'][1]['image_url']['url'] === self::IMAGE);
    }

    public function test_a_resume_fills_the_biodata_with_the_highest_attainment_and_work_history(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies(json_encode([
            'document_type' => 'resume', 'first_name' => 'Carlo', 'last_name' => 'Jayco', 'city' => 'San Jose del Monte',
            'birth_date' => '2003-04-09', 'sex' => 'Male', 'civil_status' => 'single', 'nationality' => 'FILIPINO',
            'place_of_birth' => 'Caloocan City', 'emergency_name' => 'Maria Jayco', 'emergency_relationship' => 'Mother',
            'emergency_mobile' => '+63 918 765 4321', 'education_level' => 'college undergraduate',
            'school' => 'STI College San Jose del Monte', 'course' => 'BS Information Technology', 'year_graduated' => '2026',
            'license_restrictions' => ['B'],
            'work_history' => [
                ['company' => 'Jollibee Muzon', 'position' => 'Service Crew', 'from' => '2022', 'to' => '2023-06'],
                ['company' => '', 'position' => 'Ignored'],
                ['company' => 'Puregold', 'position' => 'Bagger', 'from' => 'not a date', 'to' => ''],
            ],
        ]));

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'text' => str_repeat('Resume text. ', 5)])
            ->assertOk()
            ->assertJsonPath('biodata.birth_date', '2003-04-09')
            ->assertJsonPath('biodata.sex', 'male')
            ->assertJsonPath('biodata.civil_status', 'single')
            ->assertJsonPath('biodata.nationality', 'Filipino')
            ->assertJsonPath('biodata.emergency_phone', '9187654321')
            ->assertJsonPath('biodata.education_level', 'college_undergraduate')
            ->assertJsonPath('biodata.school', 'STI College San Jose del Monte')
            ->assertJsonPath('biodata.year_graduated', '2026')
            ->assertJsonPath('biodata.work_history.0', ['company' => 'Jollibee Muzon', 'position' => 'Service Crew', 'from' => '2022-01', 'to' => '2023-06'])
            ->assertJsonPath('biodata.work_history.1.from', '')
            ->assertJsonCount(2, 'biodata.work_history')
            // A resume never ticks license restriction codes
            ->assertJsonMissingPath('biodata.license_restrictions');
    }

    public function test_a_license_fills_its_restriction_codes_and_printed_details_only(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies(json_encode([
            'document_type' => 'drivers_license', 'first_name' => 'Pedro', 'last_name' => 'Santos',
            'license_number' => 'N16-24-001430', 'license_expiry' => '2028-11-14',
            'license_restrictions' => ['a', 'B', 'B1', 'Z9'], 'birth_date' => '1990-02-01', 'sex' => 'M',
            'education_level' => 'college_graduate', 'school' => 'Should not fill',
        ]));

        $this->postJson('/api/scan-document', ['kind' => 'license', 'image' => self::IMAGE])
            ->assertOk()
            ->assertJsonPath('biodata.license_restrictions', ['A', 'B', 'B1'])
            ->assertJsonPath('biodata.birth_date', '1990-02-01')
            ->assertJsonPath('biodata.sex', 'male')
            ->assertJsonMissingPath('biodata.education_level')
            ->assertJsonMissingPath('biodata.school');
    }

    public function test_a_name_without_an_address_still_fills_the_name(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{"first_name": "Ana", "last_name": "Reyes", "mobile": "12345"}');

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => self::IMAGE])
            ->assertOk()
            ->assertJsonPath('person.last_name', 'Reyes')
            ->assertJsonPath('person.phone', '')
            ->assertJsonPath('address', null);
    }

    public function test_nothing_found_is_a_clear_error(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{"first_name": "", "city": ""}');

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => self::IMAGE])
            ->assertStatus(422)
            ->assertJsonPath('message', 'No name or address was found in this document. Fill in the form by hand.');
    }

    public function test_only_images_are_accepted_and_only_by_hr(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{}');
        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => 'data:text/html;base64,PGh0bWw+'])->assertStatus(422);

        Sanctum::actingAs(User::factory()->create(['role' => 'customer']));
        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => self::IMAGE])->assertStatus(403);
    }

    public function test_without_a_key_scanning_says_it_is_not_set_up(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        config(['services.groq.key' => null]);

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => self::IMAGE])->assertStatus(503);
    }

    public function test_the_license_zone_takes_only_a_drivers_license(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{"document_type": "other_id", "first_name": "Ana", "last_name": "Reyes"}');

        $this->postJson('/api/scan-document', ['kind' => 'license', 'image' => self::IMAGE])
            ->assertStatus(422)
            ->assertJsonPath('message', "This is not a driver's license. Upload a clear photo of the LTO driver's license.");

        // A license is a picture, never resume text.
        $this->postJson('/api/scan-document', ['kind' => 'license', 'text' => str_repeat('Juan Dela Cruz ', 3)])
            ->assertStatus(422);
    }

    public function test_the_resume_zone_turns_down_an_id(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{"document_type": "drivers_license", "first_name": "Ana", "last_name": "Reyes", "license_number": "N01-23-456789"}');

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'image' => self::IMAGE])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This looks like an ID, not a resume. Upload the resume or CV here (PDF or Word).');
    }

    public function test_resume_text_is_read_and_a_plus63_or_0_number_is_the_same_mobile(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{"document_type": "resume", "first_name": "Ana", "last_name": "Reyes", "mobile": "+63 (0) 917-123-4567"}');

        $this->postJson('/api/scan-document', ['kind' => 'resume', 'text' => 'ANA REYES  Mobile: +63 (0) 917-123-4567  ana@example.com'])
            ->assertOk()
            ->assertJsonPath('person.phone', '9171234567');
        Http::assertSent(fn ($req) => is_string($req['messages'][0]['content']) && str_contains($req['messages'][0]['content'], 'ANA REYES'));
    }

    public function test_a_mobile_the_model_missed_is_taken_from_the_resume_text(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->groqReplies('{"document_type": "resume", "first_name": "Ana", "last_name": "Reyes", "mobile": ""}');
        $this->postJson('/api/scan-document', ['kind' => 'resume', 'text' => 'Ana Reyes, Tel 8123-4567, Cell 0918 765 4321'])
            ->assertOk()
            ->assertJsonPath('person.phone', '9187654321');
    }

    public function test_applicant_address_is_saved(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));

        $this->postJson('/api/applicants', [
            'name' => 'Juan Dela Cruz',
            'position_applied' => 'Driver',
            'street' => 'Quirino Highway',
            'barangay' => 'Muzon',
            'barangay_code' => '031420007',
            'city' => 'San Jose Del Monte',
            'province' => 'Bulacan',
            'region' => 'Region III – Central Luzon',
        ])->assertCreated();

        $this->assertSame('031420007', Applicant::first()->barangay_code);
    }
}
