<?php

namespace App\Console\Commands;

use App\Support\ArchiveExpiry;
use App\Support\Settings;
use Illuminate\Console\Command;

// php artisan archive:expire : applies archive.expiry_action now (the live-feed
// poll also runs it once a day).
class ExpireArchive extends Command
{
    protected $signature = 'archive:expire';

    protected $description = 'Anonymize or purge inactive employees past the retention period (archive.expiry_action)';

    public function handle(): int
    {
        $action = Settings::get('archive.expiry_action');
        $count = ArchiveExpiry::run();
        $this->info($action === 'REVIEW' ? 'archive.expiry_action is REVIEW: nothing was changed.' : "{$action}: {$count} employee(s).");

        return self::SUCCESS;
    }
}
