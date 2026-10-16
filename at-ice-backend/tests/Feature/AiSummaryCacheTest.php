<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiSummaryCacheTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Never call the real Groq API from a test.
        Http::preventStrayRequests();
        config(['services.groq.key' => 'test-key']);
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@atice.cloud', 'password' => 'secret-password', 'role' => 'admin']));
    }

    private function groqReplies(string ...$texts): void
    {
        $sequence = Http::sequence();
        foreach ($texts as $text) {
            $sequence->push(['choices' => [['message' => ['content' => $text]]]]);
        }
        Http::fake(['api.groq.com/*' => $sequence]);
    }

    // A sale this month changes the figures the summary is based on.
    private function sale(float $amount): void
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUST-ALF-001'], ['name' => 'Alfamart Muzon', 'branch_code' => 'ALF-SJDM-001', 'is_active' => true]);
        $sales = User::firstOrCreate(['email' => 'sales@atice.cloud'], ['name' => 'Salesman', 'password' => 'secret-password', 'role' => 'employee', 'sub_role' => 'salesman']);
        $no = 'RCP-'.(Receipt::count() + 1);
        $delivery = Delivery::create(['delivery_no' => "DEL-{$no}", 'driver_id' => $sales->id, 'customer_id' => $customer->id, 'status' => 'delivered', 'scheduled_date' => now()->toDateString(), 'prepared_by' => $sales->id]);
        $proof = DeliveryProof::create(['delivery_id' => $delivery->id, 'salesman_id' => $sales->id, 'quantity' => 1, 'photo_path' => 'x.jpg', 'confirmed_at' => now()]);
        Receipt::create(['receipt_no' => $no, 'delivery_id' => $delivery->id, 'delivery_proof_id' => $proof->id, 'customer_id' => $customer->id, 'salesman_id' => $sales->id, 'quantity' => 1, 'unit_price' => $amount, 'total_amount' => $amount, 'payment_status' => 'paid']);
    }

    public function test_groq_is_called_again_only_when_the_figures_change(): void
    {
        $this->groqReplies('First summary.', 'Second summary.');

        $first = $this->getJson('/api/bi/ai-summary')->assertOk()
            ->assertJsonPath('summary', 'First summary.')
            ->assertJsonPath('stale', false)
            ->json();
        $this->assertNotNull($first['generated_at']);
        Http::assertSentCount(1);

        // Same figures: the stored summary, no Groq call
        $this->getJson('/api/bi/ai-summary')->assertOk()
            ->assertJsonPath('summary', 'First summary.')
            ->assertJsonPath('generated_at', $first['generated_at']);
        Http::assertSentCount(1);

        // New figures: exactly one new Groq call
        $this->sale(500);
        $this->getJson('/api/bi/ai-summary')->assertOk()->assertJsonPath('summary', 'Second summary.');
        $this->getJson('/api/bi/ai-summary')->assertOk()->assertJsonPath('summary', 'Second summary.');
        Http::assertSentCount(2);
    }

    public function test_a_groq_error_returns_the_last_summary_marked_stale(): void
    {
        Http::fake(['api.groq.com/*' => Http::sequence()
            ->push(['choices' => [['message' => ['content' => 'First summary.']]]])
            ->push(['error' => ['message' => 'Rate limit reached. Please try again in 20.62s.']], 429)
            ->push(['error' => ['message' => 'Server error']], 500)]);

        $this->getJson('/api/bi/ai-summary')->assertOk()->assertJsonPath('summary', 'First summary.');

        $this->sale(500);
        $this->getJson('/api/bi/ai-summary')->assertOk()
            ->assertJsonPath('summary', 'First summary.')
            ->assertJsonPath('stale', true)
            ->assertJsonPath('message', 'The AI is busy. Try again in 21 seconds.');

        // While Groq asked us to wait, it is not called again
        $this->getJson('/api/bi/ai-summary')->assertOk()->assertJsonPath('stale', true);
        Http::assertSentCount(2);

        // After the wait, a Groq error still shows the last summary
        $this->travel(30)->seconds();
        $this->getJson('/api/bi/ai-summary')->assertOk()
            ->assertJsonPath('summary', 'First summary.')
            ->assertJsonPath('stale', true);
        Http::assertSentCount(3);
    }

    public function test_a_rate_limit_with_no_summary_yet_is_a_429(): void
    {
        Http::fake(['api.groq.com/*' => Http::response(['error' => ['message' => 'Rate limit reached. Please try again in 5s.']], 429)]);

        $this->getJson('/api/bi/ai-summary')->assertStatus(429)
            ->assertHeader('Retry-After', '5')
            ->assertJsonPath('message', 'The AI is busy. Try again in 5 seconds.');
    }

    public function test_refresh_makes_a_new_summary_at_most_once_in_five_minutes(): void
    {
        $this->groqReplies('First summary.', 'Second summary.');

        $this->getJson('/api/bi/ai-summary')->assertOk();
        $this->getJson('/api/bi/ai-summary?refresh=1')->assertOk()->assertJsonPath('summary', 'First summary.');
        Http::assertSentCount(1);

        $this->travel(6)->minutes();
        $this->getJson('/api/bi/ai-summary?refresh=1')->assertOk()->assertJsonPath('summary', 'Second summary.');
        Http::assertSentCount(2);
    }
}
