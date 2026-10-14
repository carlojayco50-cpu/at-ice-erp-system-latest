<?php

namespace Tests\Feature;

use App\Models\Holiday;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// R3 phase 1: the holiday calendar.
class HolidayCalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_2026_holidays_are_seeded(): void
    {
        $this->assertSame(20, Holiday::where('year', 2026)->count());
        $this->assertSame('REGULAR', Holiday::forDate('2026-12-25')->type);
        $this->assertSame('SPECIAL_NON_WORKING', Holiday::forDate('2026-08-21')->type);
        $this->assertSame('SPECIAL_WORKING', Holiday::forDate('2026-02-25')->type);
        $this->assertNull(Holiday::forDate('2026-10-15'));
    }

    public function test_hr_and_admin_manage_holidays_others_cannot(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'hr']));
        $this->postJson('/api/holidays', ['date' => '2026-05-27', 'name' => "Eid'l Adha", 'type' => 'REGULAR'])->assertCreated();
        $this->postJson('/api/holidays', ['date' => '2026-05-27', 'name' => 'Again', 'type' => 'REGULAR'])->assertStatus(422);
        $this->postJson('/api/holidays', ['date' => '2026-06-01', 'name' => 'Bad', 'type' => 'HOLIDAY'])->assertStatus(422);
        $this->assertSame("Eid'l Adha", Holiday::forDate('2026-05-27')->name);

        $id = Holiday::where('date', '2026-05-27')->value('id');
        $this->putJson("/api/holidays/{$id}", ['date' => '2026-05-27', 'name' => "Eid'l Adha", 'type' => 'REGULAR', 'is_double' => true])->assertOk();
        $this->assertTrue(Holiday::forDate('2026-05-27')->is_double);

        $this->getJson('/api/holidays?year=2026')->assertOk()->assertJsonCount(21, 'holidays');

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->deleteJson("/api/holidays/{$id}")->assertOk();
        $this->assertNull(Holiday::forDate('2026-05-27'));

        Sanctum::actingAs(User::factory()->create(['role' => 'employee', 'sub_role' => 'checker']));
        $this->getJson('/api/holidays')->assertForbidden();
    }
}
