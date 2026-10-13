<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeNoAccountTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsHr(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
    }

    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'street' => 'Quirino Highway',
            'barangay' => 'Muzon',
            'city' => 'San Jose del Monte',
            'province' => 'Bulacan',
            'daily_rate' => 0,
            'date_hired' => now()->subDay()->toDateString(),
            'shift' => 'day',
            'employment_type' => 'regular',
        ];
    }

    private function descriptor(): array
    {
        return array_fill(0, 128, 0.1);
    }

    public function test_guard_is_added_without_an_account_and_listed(): void
    {
        $this->actingAsHr();

        $res = $this->postJson('/api/employees', $this->payload(['position' => 'Guard']))
            ->assertCreated()
            ->assertJsonPath('password', null);

        $employee = Employee::find($res->json('employee.id'));
        $this->assertNull($employee->user_id);
        $this->assertSame(1, User::count()); // only the HR user

        $this->getJson('/api/employees')
            ->assertOk()
            ->assertJsonFragment(['id' => $employee->id, 'position' => 'Guard', 'face_data' => null]);
    }

    public function test_guard_gets_no_account_even_if_an_email_is_sent(): void
    {
        $this->actingAsHr();

        $res = $this->postJson('/api/employees', $this->payload(['position' => 'Bagger', 'email' => 'x@atice.cloud']))
            ->assertCreated()
            ->assertJsonPath('email', null);

        $this->assertNull(Employee::find($res->json('employee.id'))->user_id);
        $this->assertSame(1, User::count()); // only the HR user
    }

    public function test_checker_still_needs_a_phone(): void
    {
        $this->actingAsHr();

        // The login email is made by the server, so only the phone is asked for.
        $this->postJson('/api/employees', $this->payload(['position' => 'Checker']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone'])
            ->assertJsonMissingValidationErrors(['email']);
    }

    public function test_checker_gets_an_account_with_one_time_password(): void
    {
        $this->actingAsHr();

        $res = $this->postJson('/api/employees', $this->payload([
            'position' => 'Checker',
            'email' => 'ignored@atice.cloud', // the server makes the email itself
            'phone' => '09171234550',
        ]))->assertCreated();

        // random, so only its shape is checked here (see EmployeeOneTimePasswordTest)
        $this->assertMatchesRegularExpression('/^\S{12}$/', $res->json('password'));
        $this->assertSame('delacruz.juan.0001@atice.cloud', $res->json('email'));
        $user = User::where('email', 'delacruz.juan.0001@atice.cloud')->first();
        $this->assertSame('checker', $user->sub_role);
        $this->assertTrue($user->must_change_password);
        $this->assertNull(User::where('email', 'ignored@atice.cloud')->first());
    }

    public function test_employee_codes_do_not_collide(): void
    {
        $this->actingAsHr();

        $a = $this->postJson('/api/employees', $this->payload(['position' => 'Guard']))->json('employee.employee_id');
        $b = $this->postJson('/api/employees', $this->payload([
            'position' => 'Driver', 'email' => 'd@atice.cloud', 'phone' => '09171234551',
        ]))->json('employee.employee_id');

        $this->assertNotSame($a, $b);
    }

    public function test_guard_face_is_linked_to_the_employee_and_shows_as_registered(): void
    {
        $this->actingAsHr();
        $id = $this->postJson('/api/employees', $this->payload(['position' => 'Guard']))->json('employee.id');

        // A wrong role is refused
        $this->postJson('/api/face-enroll', [
            'worker_name' => 'Dela Cruz, Juan', 'role' => 'bagger', 'employee_id' => $id, 'descriptor' => $this->descriptor(),
        ])->assertStatus(422);

        $this->postJson('/api/face-enroll', [
            'worker_name' => 'Dela Cruz, Juan', 'role' => 'guard', 'employee_id' => $id, 'descriptor' => $this->descriptor(),
        ])->assertCreated();

        $faceData = collect($this->getJson('/api/employees')->json())->firstWhere('id', $id)['face_data'];
        $this->assertNotNull($faceData);
    }

    private function jpegDataUrl(): string
    {
        // A 1x1 JPEG (no GD needed)
        return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    }

    public function test_face_picture_is_saved_replaced_and_deleted(): void
    {
        \Illuminate\Support\Facades\Storage::fake('local');
        $this->actingAsHr();
        $id = $this->postJson('/api/employees', $this->payload(['position' => 'Guard']))->json('employee.id');

        $faceId = $this->postJson('/api/face-enroll', [
            'worker_name' => 'Dela Cruz, Juan', 'role' => 'guard', 'employee_id' => $id,
            'descriptor' => $this->descriptor(), 'photo' => $this->jpegDataUrl(),
        ])->assertCreated()->json('face_data.id');

        $first = collect($this->getJson('/api/employees')->json())->firstWhere('id', $id)['face_data']['photo_path'];
        $this->assertStringStartsWith('face-photos/', $first);
        \Illuminate\Support\Facades\Storage::disk('local')->assertExists($first);

        // Re-enroll with a new picture: the old file is removed
        $this->putJson("/api/face-data/{$faceId}", ['descriptor' => $this->descriptor(), 'photo' => $this->jpegDataUrl()])->assertOk();
        $second = \App\Models\FaceData::find($faceId)->photo_path;
        $this->assertNotSame($first, $second);
        \Illuminate\Support\Facades\Storage::disk('local')->assertMissing($first);
        \Illuminate\Support\Facades\Storage::disk('local')->assertExists($second);

        // Not a picture: refused
        $this->putJson("/api/face-data/{$faceId}", ['descriptor' => $this->descriptor(), 'photo' => 'data:image/jpeg;base64,bm90IGFuIGltYWdl'])
            ->assertStatus(422)->assertJsonValidationErrors('photo');

        $this->deleteJson("/api/face-data/{$faceId}")->assertOk();
        \Illuminate\Support\Facades\Storage::disk('local')->assertMissing($second);
    }
}
