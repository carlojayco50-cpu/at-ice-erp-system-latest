<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class HrAccountSeeder extends Seeder
{
    /**
     * Creates (or resets) the HR account on the live server.
     * The password is typed in when the command runs, so it is never saved in GitHub.
     *
     * Run: php artisan db:seed --class=HrAccountSeeder --force
     */
    public function run(): void
    {
        $email = 'hr@atice.cloud';
        $password = $this->command->secret('Enter password for '.$email.' (min. 8 characters)');

        if (! $password || strlen($password) < 8) {
            $this->command->error('Password must be at least 8 characters. Nothing was changed.');

            return;
        }

        $user = User::firstOrNew(['email' => $email]);
        $user->forceFill([
            'name' => 'HR Staff',
            'email' => $email,
            'password' => Hash::make($password),
            'role' => 'hr',
        ])->save();

        $this->command->info('HR account ready: '.$email);
    }
}
