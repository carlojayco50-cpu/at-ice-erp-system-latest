<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Services\AddressFormatter;
use App\Services\GeocodingService;
use Illuminate\Database\Seeder;

// The real delivery list (2026-10-15): 40 food stalls inside SM City San Jose
// del Monte and 48 Alfamart branches in SJDM and Norzagaray. Each one is its own
// customer. The source only had names and Google Maps search links (not exact
// pins), so the link is kept in the notes, the pin is approximate (geocoded from
// the barangay, or the mall for the stalls) and Admin still adds the contact
// person, number, email (portal login) and street on Edit Customer.
// Safe to run again: rows are matched by name.
//   php artisan db:seed --class=DeliveryLocationsSeeder
class DeliveryLocationsSeeder extends Seeder
{
    private const REGION = 'Region III – Central Luzon';

    private const PROVINCE = 'Bulacan';

    private const SJDM = ['San Jose Del Monte', '031420'];

    private const NZG = ['Norzagaray', '031413'];

    private const MAPS = 'https://www.google.com/maps/search/?api=1&query=';

    // [name, Maps query, check note or null]
    private const SM_STALLS = [
        ['Tobistro Food', 'Tobistro SM City San Jose del Monte', null],
        ['Savory', 'Savory SM City San Jose del Monte', null],
        ['Buko Juan', 'Buko Juan SM City San Jose del Monte', null],
        ['Palpitate', 'Palpitate SM City San Jose del Monte', 'Small kiosk, may have no pin of its own.'],
        ['Zarks Burger', 'Zarks Burger SM City San Jose del Monte', null],
        ['Mango Float', 'Mango Float SM City San Jose del Monte', null],
        ['Infinitea', 'Infinitea SM City San Jose del Monte', null],
        ['SMSJ Project', 'SM City San Jose del Monte Admin Office', 'Likely an office/contractor, not a stall. Ask the mall admin or client for the drop-off point.'],
        ['Gang Gang Chicken', 'Gang Gang Chicken SM City San Jose del Monte', null],
        ['Chooks to Go', 'Chooks to Go SM City San Jose del Monte', null],
        ['Cabalen', 'Cabalen SM City San Jose del Monte', null],
        ['Shakeys', 'Shakeys SM City San Jose del Monte', null],
        ['David Tea', 'David Tea SM City San Jose del Monte', 'Small kiosk, may have no pin of its own.'],
        ['Mi Ma Grill', 'Mi Ma Grill SM City San Jose del Monte', 'Small kiosk, may have no pin of its own.'],
        ['Bonchon', 'Bonchon SM City San Jose del Monte', null],
        ['Dunkin Donuts', 'Dunkin Donuts SM City San Jose del Monte', null],
        ['Buko Loco', 'Buko Loco SM City San Jose del Monte', null],
        ['Fruity Lemon', 'Fruity Lemon SM City San Jose del Monte', null],
        ["Max's", "Max's Restaurant SM City San Jose del Monte", null],
        ['Bibingka and Coffee', 'Bibingka and Coffee SM City San Jose del Monte', null],
        ['Fruitas', 'Fruitas SM City San Jose del Monte', null],
        ['PPI Holdings', 'PPI Holdings SM City San Jose del Monte', 'Likely an office/contractor, not a stall. Ask the mall admin or client for the drop-off point.'],
        ['Siomai House', 'Siomai House SM City San Jose del Monte', null],
        ['Goto ni Juan', 'Goto ni Juan SM City San Jose del Monte', null],
        ["Sam's", "Sam's SM City San Jose del Monte", 'Small kiosk, may have no pin of its own.'],
        ['Rice N Box', 'Rice N Box SM City San Jose del Monte', null],
        ['Paotsin', 'Paotsin SM City San Jose del Monte', null],
        ['Hongkong Noodles', 'Hongkong Noodles SM City San Jose del Monte', null],
        ['Zagu', 'Zagu SM City San Jose del Monte', null],
        ['Kyu Kyu Ramen', 'Kyu Kyu Ramen SM City San Jose del Monte', null],
        ['Dunsmuir', 'Dunsmuir SM City San Jose del Monte', 'Small kiosk, may have no pin of its own.'],
        ['Belgian Waffles', 'Belgian Waffles SM City San Jose del Monte', null],
        ['Avocadoria', 'Avocadoria SM City San Jose del Monte', null],
        ['Coco Shake', 'Coco Shake SM City San Jose del Monte', null],
        ['All About Lemon', 'All About Lemon SM City San Jose del Monte', null],
        ['Jessie Cane', 'Jessie Cane SM City San Jose del Monte', null],
        ['I Kitchen', 'I Kitchen SM City San Jose del Monte', 'Small kiosk, may have no pin of its own.'],
        ['Samgyeop Masarap', 'Samgyeop Masarap SM City San Jose del Monte', null],
        ['Giligans', 'Gilligans SM City San Jose del Monte', null],
        ['Clydes', 'Clydes SM City San Jose del Monte', null],
    ];

    // [name, city, barangay (PSGC code suffix => name) or null, street, subdivision, Maps query, check note]
    private const ALFAMART = [
        ['Alfamart Amaresa Subd Francisco Homes', 'SJDM', null, null, 'Amaresa Subd., Francisco Homes', 'Alfamart Amaresa Francisco Homes San Jose del Monte', 'Barangay not given (which Francisco Homes?).'],
        ['Alfamart Andrew Subd Poblacion I', 'SJDM', ['043', 'Poblacion I'], null, 'Andrew Subd.', 'Alfamart Andrew Subdivision Poblacion I San Jose del Monte', null],
        ['Alfamart Assumption', 'SJDM', ['019', 'Assumption'], null, null, 'Alfamart Assumption San Jose del Monte', null],
        ['Alfamart Bagong Buhay II', 'SJDM', ['020', 'Bagong Buhay II'], null, null, 'Alfamart Bagong Buhay II San Jose del Monte', null],
        ['Alfamart Bigte Norzagaray', 'NZG', ['006', 'Bigte'], null, null, 'Alfamart Bigte Norzagaray Bulacan', null],
        ['Alfamart Bigte 2 Norzagaray', 'NZG', ['006', 'Bigte'], null, null, 'Alfamart Bigte 2 Norzagaray Bulacan', null],
        ['Alfamart Bitungol Norzagaray', 'NZG', ['007', 'Bitungol'], null, null, 'Alfamart Bitungol Norzagaray Bulacan', null],
        ['Alfamart Citrus', 'SJDM', ['012', 'Citrus'], null, null, 'Alfamart Citrus San Jose del Monte', null],
        ['Alfamart Fatima II', 'SJDM', ['023', 'Fatima II'], null, null, 'Alfamart Fatima II San Jose del Monte', null],
        ['Alfamart Fatima IV', 'SJDM', ['025', 'Fatima IV'], null, null, 'Alfamart Fatima IV San Jose del Monte', null],
        ['Alfamart Gaya-Gaya', 'SJDM', ['003', 'Gaya-gaya'], null, null, 'Alfamart Gaya-Gaya San Jose del Monte', 'Possibly the same branch as Alfamart Gaya-Gaya SJDM. Confirm there are two.'],
        ['Alfamart Gumaoc Central', 'SJDM', ['032', 'Gumaoc Central'], null, null, 'Alfamart Gumaok Central San Jose del Monte', null],
        ['Alfamart Kaypian', 'SJDM', ['004', 'Kaypian'], null, null, 'Alfamart Kaypian San Jose del Monte', null],
        ['Alfamart Minuyan Norzagaray', 'NZG', ['016', 'Minuyan'], null, null, 'Alfamart Minuyan Norzagaray Bulacan', null],
        ['Alfamart Minuyan IV', 'SJDM', ['039', 'Minuyan IV'], null, null, 'Alfamart Minuyan IV San Jose del Monte', 'Possibly the same branch as Alfamart Minuyan IV SJDM. Confirm there are two.'],
        ['Alfamart San Mateo Norzagaray', 'NZG', ['024', 'San Mateo'], null, null, 'Alfamart San Mateo Norzagaray Bulacan', null],
        ['Alfamart San Rafael III', 'SJDM', ['050', 'San Rafael III'], null, null, 'Alfamart San Rafael III San Jose del Monte', null],
        ['Alfamart Dulong Bayan', 'SJDM', ['002', 'Dulong Bayan'], null, null, 'Alfamart Dulong Bayan San Jose del Monte', null],
        ['Alfamart EVR Ave Sta. Cruz I', 'SJDM', ['014', 'Santa Cruz I'], 'EVR Avenue', null, 'Alfamart EVR Avenue Sta Cruz I San Jose del Monte', null],
        ['Alfamart F. Homes Narra', 'SJDM', ['029', 'Francisco Homes-Narra'], null, null, 'Alfamart Francisco Homes Narra San Jose del Monte', null],
        ['Alfamart F. Homes Narra 2', 'SJDM', ['029', 'Francisco Homes-Narra'], null, null, 'Alfamart Francisco Homes Narra 2 San Jose del Monte', null],
        ['Alfamart Farmview Tungkong Mangga', 'SJDM', ['011', 'Tungkong Mangga'], null, 'Farmview', 'Alfamart Farmview Tungkong Mangga San Jose del Monte', null],
        ['Alfamart Gaya-Gaya SJDM', 'SJDM', ['003', 'Gaya-gaya'], null, null, 'Alfamart Gaya-Gaya San Jose del Monte Bulacan', 'Possibly the same branch as Alfamart Gaya-Gaya. Confirm there are two.'],
        ['Alfamart Gov. F. Halili Gaya-Gaya', 'SJDM', ['003', 'Gaya-gaya'], 'Gov. F. Halili Ave.', null, 'Alfamart Gov F Halili Gaya-Gaya San Jose del Monte', null],
        ['Alfamart Igay Road Sto. Cristo', 'SJDM', ['009', 'Santo Cristo'], 'Igay Road', null, 'Alfamart Igay Road Sto Cristo San Jose del Monte', null],
        ['Alfamart Ipo Road Minuyan', 'SJDM', ['041', 'Minuyan Proper'], 'Ipo Road', null, 'Alfamart Ipo Road Minuyan San Jose del Monte', 'Listed as "Brgy Minuyan"; set to Minuyan Proper. Check the barangay.'],
        ['Alfamart Lawang Pari', 'SJDM', ['035', 'Lawang Pari'], null, null, 'Alfamart Lawang Pari San Jose del Monte', null],
        ['Alfamart Maharlika', 'SJDM', ['036', 'Maharlika'], null, null, 'Alfamart Maharlika San Jose del Monte', null],
        ['Alfamart Minuyan II', 'SJDM', ['037', 'Minuyan II'], null, null, 'Alfamart Minuyan II San Jose del Monte', null],
        ['Alfamart Minuyan IV SJDM', 'SJDM', ['039', 'Minuyan IV'], null, null, 'Alfamart Minuyan IV San Jose del Monte Bulacan', 'Possibly the same branch as Alfamart Minuyan IV. Confirm there are two.'],
        ['Alfamart Northwinds 3B Kaypian', 'SJDM', ['004', 'Kaypian'], null, 'Northwinds 3B', 'Alfamart Northwinds Kaypian San Jose del Monte', null],
        ['Alfamart Phase 7 Palmera Homes', 'SJDM', null, null, 'Palmera Homes Phase 7', 'Alfamart Palmera Homes Phase 7 San Jose del Monte', 'Barangay not given.'],
        ['Alfamart Poblacion', 'SJDM', ['008', 'Poblacion'], null, null, 'Alfamart Poblacion San Jose del Monte', null],
        ['Alfamart Purok 7 Bagong Buhay', 'SJDM', null, 'Purok 7', null, 'Alfamart Purok 7 Bagong Buhay San Jose del Monte', 'Bagong Buhay I, II or III not given.'],
        ['Alfamart Purok III Graceville', 'SJDM', ['031', 'Graceville'], 'Purok III', null, 'Alfamart Graceville San Jose del Monte', null],
        ['Alfamart Road 2 Minuyan', 'SJDM', ['041', 'Minuyan Proper'], 'Road 2', null, 'Alfamart Road 2 Minuyan San Jose del Monte', 'Listed as "Minuyan"; set to Minuyan Proper. Check the barangay.'],
        ['Alfamart San Martin II', 'SJDM', ['046', 'San Martin II'], null, null, 'Alfamart San Martin II San Jose del Monte', null],
        ['Alfamart San Pedro', 'SJDM', ['016', 'San Pedro'], null, null, 'Alfamart San Pedro San Jose del Monte', null],
        ['Alfamart San Rafael', 'SJDM', null, null, null, 'Alfamart San Rafael San Jose del Monte', 'San Rafael I to V not given.'],
        ['Alfamart St. Martin', 'SJDM', null, null, null, 'Alfamart San Martin San Jose del Monte', 'Which San Martin (I to IV, de Porres) not given.'],
        ['Alfamart Sta. Cruz I', 'SJDM', ['014', 'Santa Cruz I'], null, null, 'Alfamart Sta Cruz I San Jose del Monte', null],
        ['Alfamart Sta. Cruz V', 'SJDM', ['057', 'Santa Cruz V'], null, null, 'Alfamart Sta Cruz V San Jose del Monte', null],
        ['Alfamart Sto. Cristo', 'SJDM', ['009', 'Santo Cristo'], null, null, 'Alfamart Sto Cristo San Jose del Monte', null],
        ['Alfamart Sto. Cristo 2', 'SJDM', ['009', 'Santo Cristo'], null, null, 'Alfamart Sto Cristo 2 San Jose del Monte', null],
        ['Alfamart Tigbe Norzagaray', 'NZG', ['031', 'Tigbe'], null, null, 'Alfamart Tigbe Norzagaray Bulacan', null],
        ['Alfamart Tigbe 2 Norzagaray', 'NZG', ['031', 'Tigbe'], null, null, 'Alfamart Tigbe 2 Norzagaray Bulacan', null],
        ['Alfamart Towerville Sto. Cristo', 'SJDM', ['009', 'Santo Cristo'], null, 'Towerville', 'Alfamart Towerville Sto Cristo San Jose del Monte', null],
        ['Alfamart Villarama Road Minuyan Norzagaray', 'NZG', ['016', 'Minuyan'], 'Villarama Road', null, 'Alfamart Villarama Road Minuyan Norzagaray', null],
    ];

    private array $pins = [];

    public function run(): void
    {
        $mall = $this->pin('SM City San Jose del Monte', '', 'San Jose del Monte', self::PROVINCE);

        foreach (self::SM_STALLS as [$name, $query, $check]) {
            $this->save($name, [
                'city' => self::SJDM[0],
                'barangay' => 'Tungkong Mangga',
                'barangay_code' => self::SJDM[1].'011',
                'street' => 'Quirino Highway',
                'subdivision' => 'SM City San Jose del Monte',
                'mop' => 'cash',
            ], $mall, $query, $check, 'SM City San Jose del Monte food stall.');
        }

        foreach (self::ALFAMART as [$name, $town, $brgy, $street, $subdivision, $query, $check]) {
            [$city, $code] = $town === 'NZG' ? self::NZG : self::SJDM;
            $pin = $this->pin('', $brgy[1] ?? '', $city === self::SJDM[0] ? 'San Jose del Monte' : $city, self::PROVINCE);

            $this->save($name, [
                'city' => $city,
                'barangay' => $brgy[1] ?? null,
                'barangay_code' => $brgy ? $code.$brgy[0] : null,
                'street' => $street,
                'subdivision' => $subdivision,
                'mop' => 'bank_transfer',
            ], $pin, $query, $check, 'Alfamart branch.');
        }

        $this->command?->info('Delivery locations: '.count(self::SM_STALLS).' SM stalls and '.count(self::ALFAMART).' Alfamart branches.');
    }

    private function save(string $name, array $address, ?array $pin, string $query, ?string $check, string $kind): void
    {
        $data = $address + ['region' => self::REGION, 'province' => self::PROVINCE];
        $data['address'] = AddressFormatter::compose($data);

        $notes = [$kind, 'Google Maps (search link, not an exact pin): '.self::MAPS.str_replace('%20', '+', rawurlencode($query))];
        $notes[] = 'Pin is approximate; adjust it on Edit Customer.';
        if ($check) {
            $notes[] = '[CHECK] '.$check;
        }
        $data['notes'] = implode("\n", $notes);
        $data['latitude'] = $pin['latitude'] ?? null;
        $data['longitude'] = $pin['longitude'] ?? null;
        $data['is_active'] = true;

        $customer = Customer::withTrashed()->where('name', $name)->first();
        if ($customer) {
            $customer->update($data);

            return;
        }

        [$customerCode, $branchCode] = $this->codes($name, $data['city']);
        Customer::create($data + [
            'name' => $name,
            'customer_code' => $customerCode,
            'branch_code' => $branchCode,
            'invoice_code' => Customer::invoiceCodeFor($name),
        ]);
    }

    // Same pattern as CustomerController::generateCodes: CUST-ALF-001 and ALF-SJDM-001.
    private function codes(string $name, string $city): array
    {
        $prefix = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', explode(' ', $name)[0]), 0, 3)) ?: 'CUS';
        $words = preg_split('/\s+/', trim($city), -1, PREG_SPLIT_NO_EMPTY);
        $area = count($words) > 1
            ? strtoupper(implode('', array_map(fn ($w) => $w[0], $words)))
            : strtoupper(substr($city, 0, 3));

        return [$this->next('customer_code', "CUST-{$prefix}-"), $this->next('branch_code', "{$prefix}-{$area}-")];
    }

    private function next(string $column, string $stem): string
    {
        $highest = Customer::withTrashed()->where($column, 'like', $stem.'%')->pluck($column)
            ->map(fn ($c) => preg_match('/^'.preg_quote($stem, '/').'(\d+)$/', $c, $m) ? (int) $m[1] : 0)
            ->max() ?? 0;

        return $stem.str_pad($highest + 1, 3, '0', STR_PAD_LEFT);
    }

    // One Nominatim lookup per place (its policy allows about one request a second).
    private function pin(string $place, string $barangay, string $city, string $province): ?array
    {
        $key = "$place|$barangay|$city";
        if (! array_key_exists($key, $this->pins)) {
            $this->pins[$key] = GeocodingService::geocode($place, $city, $province, $barangay);
            sleep(1);
        }

        return $this->pins[$key];
    }
}
