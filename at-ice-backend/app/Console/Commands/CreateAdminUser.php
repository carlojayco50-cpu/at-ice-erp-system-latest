<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class CreateAdminUser extends Command
{
    protected $signature = 'admin:create {email} {--name=Administrator : Display name}';

    protected $description = 'Create an admin login (or reset an existing one) and print a one-time password.';

    public function handle()
    {
        $email = strtolower(trim($this->argument('email')));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error("Not a valid email: {$email}");

            return self::FAILURE;
        }

        $password = Str::password(16, symbols: false);

        $user = User::updateOrCreate(
            ['email' => $email],
            ['name' => $this->option('name'), 'password' => $password, 'role' => 'admin', 'sub_role' => null]
        );
        $user->forceFill(['is_active' => true])->save();

        $this->info(($user->wasRecentlyCreated ? 'Created' : 'Reset')." admin {$email}");
        $this->line("Password: {$password}");
        $this->warn('Change it after first login (Account Settings).');

        return self::SUCCESS;
    }
}
