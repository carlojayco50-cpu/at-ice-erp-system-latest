<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Services\GeocodingService;
use Illuminate\Console\Command;

class GeocodeExistingCustomers extends Command
{
    protected $signature = 'customers:geocode {--force : Re-geocode customers that already have coordinates}';

    protected $description = 'One-time backfill: geocode existing customers that are missing latitude/longitude.';

    public function handle()
    {
        $query = Customer::query();

        if (! $this->option('force')) {
            $query->whereNull('latitude')->orWhereNull('longitude');
        }

        $customers = $query->get();

        if ($customers->isEmpty()) {
            $this->info('No customers need geocoding.');

            return self::SUCCESS;
        }

        $this->info("Geocoding {$customers->count()} customer(s)...");
        $bar = $this->output->createProgressBar($customers->count());
        $bar->start();

        $success = 0;
        $failed = [];

        foreach ($customers as $customer) {
            $coords = GeocodingService::geocode(
                $customer->address ?? '',
                $customer->city ?? '',
                $customer->province ?? ''
            );

            if ($coords) {
                $customer->update([
                    'latitude' => $coords['latitude'],
                    'longitude' => $coords['longitude'],
                ]);
                $success++;
            } else {
                $failed[] = $customer->name;
            }

            // Nominatim's usage policy asks for max ~1 request/second.
            sleep(1);
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);
        $this->info("Done. Geocoded: {$success}/{$customers->count()}.");

        if (! empty($failed)) {
            $this->warn('Failed to geocode: '.implode(', ', $failed));
        }

        return self::SUCCESS;
    }
}
