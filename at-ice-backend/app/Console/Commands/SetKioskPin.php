<?php

namespace App\Console\Commands;

use App\Models\KioskSetting;
use App\Services\KioskLockout;
use Illuminate\Console\Command;

class SetKioskPin extends Command
{
    protected $signature = 'kiosk:set-pin {pin? : The 4-digit PIN. Leave out to be asked for it, so it stays out of the shell history.}';

    protected $description = 'Set or change the HR security PIN of the Attendance Station kiosk (fallback for before any HR login exists).';

    public function handle(): int
    {
        $pin = $this->argument('pin') ?? $this->secret('New 4-digit kiosk PIN');

        if (! is_string($pin) || ! preg_match('/^\d{4}$/', $pin)) {
            $this->error('The PIN must be exactly 4 digits.');

            return self::FAILURE;
        }

        KioskSetting::current()->setPin($pin, null);
        KioskLockout::clearAll();

        $this->info('Kiosk PIN saved. Every kiosk must be unlocked again with the new PIN.');

        return self::SUCCESS;
    }
}
