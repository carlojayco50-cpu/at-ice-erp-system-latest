<?php

namespace Tests\Feature;

use App\Mail\KioskLocked;
use App\Models\KioskDevice;
use App\Models\KioskSetting;
use App\Models\LiveEvent;
use App\Models\User;
use App\Support\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3: a kiosk lock is reported to HR and Admin (live notice and email), and
// only Admin can unlock it unless kiosk.hr_can_override is on.
class KioskLockNoticeTest extends TestCase
{
    use RefreshDatabase;

    private const DEVICE = 'kiosk-0123456789abcdef';

    private function lock(): KioskDevice
    {
        KioskSetting::current()->setPin('1234', null);
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/kiosk/unlock', ['device_id' => self::DEVICE, 'pin' => '0000']);
        }

        return KioskDevice::where('device_id', self::DEVICE)->first();
    }

    public function test_a_lock_notifies_hr_and_admin(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $hr = User::factory()->create(['role' => 'hr']);
        User::factory()->create(['role' => 'employee', 'sub_role' => 'checker']);

        $device = $this->lock();
        $this->assertNotNull($device->locked_at);

        Mail::assertQueued(KioskLocked::class, 2);
        Mail::assertQueued(KioskLocked::class, fn ($m) => $m->hasTo($admin->email) && $m->kiosk === 'KIOSK-01');
        Mail::assertQueued(KioskLocked::class, fn ($m) => $m->hasTo($hr->email));

        $event = LiveEvent::where('module', 'kiosk')->where('action', 'locked')->first();
        $this->assertNotNull($event);
        $this->assertTrue($event->isFor($hr));
        $this->assertDatabaseHas('audit_logs', ['action' => 'kiosk.locked']);
    }

    public function test_only_admin_unlocks_unless_hr_override_is_on(): void
    {
        Mail::fake();
        $device = $this->lock();

        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/hr/kiosk-pin')->assertJsonPath('can_unlock', false);
        $this->postJson("/api/kiosk-devices/{$device->id}/unlock")->assertForbidden();
        $this->assertNotNull($device->fresh()->locked_at);

        Settings::set('kiosk.hr_can_override', true);
        $this->getJson('/api/hr/kiosk-pin')->assertJsonPath('can_unlock', true);
        $this->postJson("/api/kiosk-devices/{$device->id}/unlock")->assertOk();
        $this->assertNull($device->fresh()->locked_at);

        $device = $this->lock();
        Settings::set('kiosk.hr_can_override', false);
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson("/api/kiosk-devices/{$device->id}/unlock")->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'kiosk.override']);
    }

    public function test_a_new_device_id_does_not_reset_the_wrong_pin_count(): void
    {
        KioskSetting::current()->setPin('1234', null);
        // 10 wrong PINs, each from a "new kiosk" (4 per device id stays under the per-kiosk lock)
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/kiosk/unlock', ['device_id' => 'kiosk-rotating-'.intdiv($i, 4).'-abcdef', 'pin' => '0000'])->assertStatus(422);
        }
        // the address is blocked now, even with the right PIN and a fresh device id
        $this->postJson('/api/kiosk/unlock', ['device_id' => 'kiosk-fresh-0123456789', 'pin' => '1234'])
            ->assertStatus(403)->assertJsonPath('code', 'kiosk_ip_blocked');
        $this->assertDatabaseHas('audit_logs', ['action' => 'kiosk.ip_blocked']);
    }
}
