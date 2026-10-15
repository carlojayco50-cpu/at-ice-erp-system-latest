<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InvoiceCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_codes_are_made_from_the_company_name_and_never_repeat(): void
    {
        $this->assertSame('PG', Customer::invoiceCodeFor('Pure Gold', fn () => false));
        $this->assertSame('ALF', Customer::invoiceCodeFor('Alfamart Inc.', fn () => false));
        $this->assertSame('SM', Customer::invoiceCodeFor('The SM Store', fn () => false));
        // PG is taken: another letter of the name is added.
        $this->assertSame('PGR', Customer::invoiceCodeFor('Pure Gold', fn ($c) => $c === 'PG'));
    }

    public function test_admin_can_set_the_code_and_it_must_be_unique(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $a = Customer::create(['name' => 'Pure Gold', 'customer_code' => 'CUST-PUR-001', 'branch_code' => 'PUR-SJDM-001', 'invoice_code' => 'PG', 'is_active' => true]);
        $b = Customer::create(['name' => 'Puregold Express', 'customer_code' => 'CUST-PUR-002', 'branch_code' => 'PUR-SJDM-002', 'invoice_code' => 'PE', 'is_active' => true]);

        $this->getJson('/api/customers/invoice-code?name=Pure%20Gold')->assertOk()->assertJsonPath('invoice_code', 'PGR');

        $this->putJson("/api/customers/{$b->id}", ['invoice_code' => 'pg', 'contact_person' => 'Ana', 'email' => $b->email, 'contact_number' => '+639171234567'])
            ->assertStatus(422)
            ->assertJsonPath('errors.invoice_code.0', 'Another customer already uses this invoice code.');
        $this->putJson("/api/customers/{$b->id}", ['invoice_code' => 'P1', 'contact_person' => 'Ana', 'email' => $b->email, 'contact_number' => '+639171234567'])
            ->assertStatus(422);
        $this->assertSame('PG', $a->fresh()->invoice_code);
    }
}
