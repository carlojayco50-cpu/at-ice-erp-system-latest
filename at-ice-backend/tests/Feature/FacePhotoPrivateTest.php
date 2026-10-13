<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\FaceData;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Face pictures are private: stored on the local (private) disk, never the public
// one nginx serves, and sent only to HR and Admin.
class FacePhotoPrivateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Storage::fake('public');
    }

    private function as(string $role, ?string $sub = null): User
    {
        $user = User::create(['name' => ucfirst($role), 'email' => "{$role}".($sub ?? '').'@atice.cloud', 'password' => 'secret-password', 'role' => $role, 'sub_role' => $sub]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function jpegDataUrl(): string
    {
        return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    }

    private function guard(string $code = 'EMP-0001'): Employee
    {
        return Employee::create([
            'employee_id' => $code, 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'position' => 'Guard',
            'date_hired' => now()->subDay()->toDateString(), 'shift' => 'day', 'employment_type' => 'regular',
        ]);
    }

    private function enroll(): FaceData
    {
        $id = $this->postJson('/api/face-enroll', [
            'worker_name' => 'Dela Cruz, Juan', 'role' => 'guard', 'employee_id' => $this->guard()->id,
            'descriptor' => array_fill(0, 128, 0.1), 'photo' => $this->jpegDataUrl(),
        ])->assertCreated()->json('face_data.id');

        return FaceData::findOrFail($id);
    }

    public function test_the_picture_is_saved_on_the_private_disk_only(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        $this->assertStringStartsWith('face-photos/', $face->photo_path);
        Storage::disk('local')->assertExists($face->photo_path);
        Storage::disk('public')->assertMissing($face->photo_path);
    }

    public function test_hr_and_admin_can_see_it(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        $res = $this->getJson("/api/face-data/{$face->id}/photo")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('no-store', $res->headers->get('Cache-Control'));

        $this->app['auth']->forgetGuards();
        $this->as('admin');
        $this->getJson("/api/face-data/{$face->id}/photo")->assertOk();
    }

    public function test_nobody_else_can_see_it(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        foreach ([['employee', 'checker'], ['employee', 'salesman'], ['employee', 'maintenance'], ['driver', null], ['customer', null]] as [$role, $sub]) {
            $this->app['auth']->forgetGuards();
            $this->as($role, $sub);
            $this->getJson("/api/face-data/{$face->id}/photo")->assertForbidden();
        }
    }

    public function test_it_needs_a_login(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/face-data/{$face->id}/photo")->assertUnauthorized();
    }

    public function test_the_kiosk_descriptor_list_does_not_leak_the_picture(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        // What the kiosk gets from GET face-descriptors (behind the kiosk token)
        $json = app(\App\Http\Controllers\FaceDataController::class)->descriptors()->getContent();
        $this->assertStringContainsString('Dela Cruz, Juan', $json, 'the face itself is in the list');
        $this->assertStringNotContainsString('photo_path', $json);
        $this->assertStringNotContainsString($face->photo_path, $json);
    }

    public function test_no_picture_or_a_missing_file_is_a_clean_404(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        Storage::disk('local')->delete($face->photo_path);
        $this->getJson("/api/face-data/{$face->id}/photo")->assertNotFound();

        $face->update(['photo_path' => null]);
        $this->getJson("/api/face-data/{$face->id}/photo")->assertNotFound();
    }

    public function test_deleting_the_enrollment_removes_the_file(): void
    {
        $this->as('hr');
        $face = $this->enroll();

        $this->deleteJson("/api/face-data/{$face->id}")->assertOk();
        Storage::disk('local')->assertMissing($face->photo_path);
    }

    public function test_the_migration_moves_old_public_pictures_and_can_run_twice(): void
    {
        $this->as('hr');
        $employee = $this->guard('EMP-0002');
        // A picture saved the old way: on the public disk.
        $path = 'face-photos/old-one.jpg';
        Storage::disk('public')->put($path, base64_decode(substr($this->jpegDataUrl(), strlen('data:image/jpeg;base64,'))));
        $face = FaceData::create(['worker_name' => 'Santos, Ana', 'role' => 'guard', 'employee_id' => $employee->id,
            'descriptor' => array_fill(0, 128, 0.2), 'photo_path' => $path]);
        $bytes = Storage::disk('public')->get($path);

        $migration = require base_path('database/migrations/2026_10_11_000001_move_face_photos_to_private_disk.php');
        $migration->up();

        Storage::disk('public')->assertMissing($path);
        Storage::disk('local')->assertExists($path);
        $this->assertSame($bytes, Storage::disk('local')->get($path), 'same bytes, nothing changed');
        $this->assertSame($path, $face->fresh()->photo_path, 'the stored path does not change');

        $migration->up(); // again: nothing breaks, nothing is lost
        Storage::disk('local')->assertExists($path);

        $migration->down(); // and back
        Storage::disk('public')->assertExists($path);
        Storage::disk('local')->assertMissing($path);
    }
}
