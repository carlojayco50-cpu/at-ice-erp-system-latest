<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Review change request, phase 2 (docs/REVIEW-DECISIONS.md):
//   employees    deactivation (who and when, never a hard delete), probationary
//                or regular, daily or monthly pay, own shift hours, and the
//                employee number (EMP-0001) made unique: it is the search key
//   attendances  late minutes, worked out at Time In from the shift start
//   kiosks       each kiosk device has its own wrong-PIN count and lock, every
//                attempt is logged, and an Admin override PIN unlocks a kiosk
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->timestamp('deactivated_at')->nullable()->after('is_active');
            $table->foreignId('deactivated_by')->nullable()->after('deactivated_at')->constrained('users')->nullOnDelete();
            $table->string('employment_status', 20)->default('regular')->after('employment_type');
            $table->date('regularized_at')->nullable()->after('employment_status');
            $table->string('pay_basis', 10)->default('daily')->after('daily_rate');
            $table->decimal('monthly_rate', 10, 2)->nullable()->after('pay_basis');
            $table->time('shift_start')->nullable()->after('shift');
            $table->time('shift_end')->nullable()->after('shift_start');
        });

        // Everyone already on the payroll counts as regular from their hire date.
        DB::table('employees')->update(['regularized_at' => DB::raw('date_hired')]);
        DB::table('employees')->where('is_active', false)->update(['deactivated_at' => DB::raw('updated_at')]);

        Schema::table('attendances', function (Blueprint $table) {
            $table->unsignedInteger('late_minutes')->default(0)->after('hours_worked');
        });

        // Late minutes for the records already there (day shift, 09:00).
        DB::table('attendances')->whereNotNull('time_in')->orderBy('id')->each(function ($a) {
            $late = \App\Support\Lateness::minutes('09:00', (string) $a->time_in, 0);
            if ($late > 0) {
                DB::table('attendances')->where('id', $a->id)->update(['late_minutes' => $late]);
            }
        });

        Schema::table('kiosk_settings', function (Blueprint $table) {
            $table->string('admin_pin_hash')->nullable()->after('pin_changed_by');
            $table->timestamp('admin_pin_changed_at')->nullable()->after('admin_pin_hash');
        });

        Schema::create('kiosk_devices', function (Blueprint $table) {
            $table->id();
            $table->string('device_id', 64)->unique();
            $table->unsignedInteger('failed_attempts')->default(0);
            $table->timestamp('locked_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->string('last_ip', 45)->nullable();
            $table->timestamps();
        });

        Schema::create('kiosk_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kiosk_device_id')->constrained('kiosk_devices')->cascadeOnDelete();
            // wrong_pin | unlocked | locked | blocked | override_ok | override_wrong
            $table->string('result', 20);
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['kiosk_device_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kiosk_attempts');
        Schema::dropIfExists('kiosk_devices');
        Schema::table('kiosk_settings', fn (Blueprint $t) => $t->dropColumn(['admin_pin_hash', 'admin_pin_changed_at']));
        Schema::table('attendances', fn (Blueprint $t) => $t->dropColumn('late_minutes'));
        Schema::table('employees', function (Blueprint $table) {

            $table->dropConstrainedForeignId('deactivated_by');
            $table->dropColumn(['deactivated_at', 'employment_status', 'regularized_at', 'pay_basis', 'monthly_rate', 'shift_start', 'shift_end']);
        });
    }
};
