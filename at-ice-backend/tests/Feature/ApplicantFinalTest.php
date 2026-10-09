<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicantFinalTest extends TestCase
{
    use RefreshDatabase;

    public function test_hired_or_rejected_applicant_is_view_only(): void
    {
        Sanctum::actingAs(User::create(['name' => 'HR', 'email' => 'hr@atice.cloud', 'password' => 'secret-password', 'role' => 'hr']));

        foreach (['hired', 'rejected'] as $status) {
            $a = Applicant::create(['name' => 'Juan Dela Cruz', 'position_applied' => 'Checker', 'status' => $status]);

            $this->putJson("/api/applicants/{$a->id}", ['name' => 'Changed'])->assertUnprocessable();
            $this->deleteJson("/api/applicants/{$a->id}")->assertUnprocessable();
            $this->assertSame('Juan Dela Cruz', $a->fresh()->name);
        }

        // a pending applicant can still be edited
        $p = Applicant::create(['name' => 'Maria Santos', 'position_applied' => 'Salesman', 'status' => 'pending']);
        $this->putJson("/api/applicants/{$p->id}", ['name' => 'Maria S. Santos'])->assertOk();
    }
}
