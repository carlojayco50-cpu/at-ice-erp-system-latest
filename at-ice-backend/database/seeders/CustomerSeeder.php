<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    /**
     * Sample downstream network data (Alfamart branches under J-Maxine,
     * SM Mall food stalls under Alexandra) — per the client-approved scope
     * decision documented in the project notes (Clarification #1, v25.7).
     * This is a SMALL SAMPLE for testing only; full 90+ list to be seeded
     * later via bulk-import (Phase 14).
     */
    public function run(): void
    {
        $alfamartBranches = [
            ['name' => 'Alfamart San Jose del Monte Poblacion', 'branch_code' => 'ALF-SJDM-001', 'address' => 'Poblacion, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Muzon',                        'branch_code' => 'ALF-SJDM-002', 'address' => 'Muzon, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Gaya-Gaya',                     'branch_code' => 'ALF-SJDM-003', 'address' => 'Gaya-Gaya, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Fahrenheit',                    'branch_code' => 'ALF-SJDM-004', 'address' => 'Fahrenheit, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Citrus',                        'branch_code' => 'ALF-SJDM-005', 'address' => 'Citrus, San Jose del Monte', 'city' => 'San Jose del Monte', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Norzagaray Poblacion',          'branch_code' => 'ALF-NZG-001',  'address' => 'Poblacion, Norzagaray', 'city' => 'Norzagaray', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Bigte',                         'branch_code' => 'ALF-NZG-002',  'address' => 'Bigte, Norzagaray', 'city' => 'Norzagaray', 'province' => 'Bulacan'],
            ['name' => 'Alfamart Partida',                       'branch_code' => 'ALF-NZG-003',  'address' => 'Partida, Norzagaray', 'city' => 'Norzagaray', 'province' => 'Bulacan'],
        ];

        $smMallStalls = [
            ['name' => 'Tobistro Food',   'branch_code' => 'SM-SJDM-001', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Shakeys',         'branch_code' => 'SM-SJDM-002', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Buko Juan',       'branch_code' => 'SM-SJDM-003', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Pickup Coffee',   'branch_code' => 'SM-SJDM-004', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Potato Corner',   'branch_code' => 'SM-SJDM-005', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Minute Burger',   'branch_code' => 'SM-SJDM-006', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Siomai King',     'branch_code' => 'SM-SJDM-007', 'address' => 'SM City San Jose del Monte'],
            ['name' => 'Mango Bomb',      'branch_code' => 'SM-SJDM-008', 'address' => 'SM City San Jose del Monte'],
        ];

        $counter = 1;

        foreach ($alfamartBranches as $branch) {
            Customer::updateOrCreate(
                ['branch_code' => $branch['branch_code']],
                [
                    'customer_code' => 'CUST-ALF-'.str_pad($counter, 3, '0', STR_PAD_LEFT),
                    'name' => $branch['name'],
                    'branch_code' => $branch['branch_code'],
                    'address' => $branch['address'],
                    'city' => $branch['city'],
                    'province' => $branch['province'],
                    'contact_person' => null,
                    'contact_number' => null,
                    'email' => null,
                    'mop' => 'bank_transfer',
                    'is_active' => true,
                    'notes' => 'Seeded sample — Alfamart branch (J-Maxine downstream network).',
                ]
            );
            $counter++;
        }

        $counter = 1;

        foreach ($smMallStalls as $stall) {
            Customer::updateOrCreate(
                ['branch_code' => $stall['branch_code']],
                [
                    'customer_code' => 'CUST-SM-'.str_pad($counter, 3, '0', STR_PAD_LEFT),
                    'name' => $stall['name'],
                    'branch_code' => $stall['branch_code'],
                    'address' => $stall['address'],
                    'city' => 'San Jose del Monte',
                    'province' => 'Bulacan',
                    'contact_person' => null,
                    'contact_number' => null,
                    'email' => null,
                    'mop' => 'cash',
                    'is_active' => true,
                    'notes' => 'Seeded sample — SM Mall food stall (Alexandra downstream network).',
                ]
            );
            $counter++;
        }
    }
}
