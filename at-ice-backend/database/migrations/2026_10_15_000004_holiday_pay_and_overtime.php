<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// R3 (docs/REVIEW-DECISIONS.md): holiday pay and overtime.
//   pay_multipliers  rates for holiday work and overtime, each with the date
//                    it takes effect. Seeded with the CLIENT's defaults; the
//                    DOLE value is kept in the note for comparison.
//   attendances      overtime minutes past the shift end (worked out at Time
//                    Out), paid only after HR approves them (ot_approved)
//   payrolls         holiday pay, holiday overtime and ordinary overtime are
//                    separate payslip lines from basic pay
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pay_multipliers', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40);
            $table->decimal('value', 5, 2);
            $table->date('effective_date');
            $table->string('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['key', 'effective_date']);
        });

        $now = now();
        $rows = [
            // key, client default, DOLE reference
            ['REGULAR_HOLIDAY_WORKED', 2.00, 'DOLE 2.00'],
            ['REGULAR_HOLIDAY_UNWORKED', 0.00, 'DOLE 1.00 (client: no work, no pay)'],
            ['SPECIAL_HOLIDAY_WORKED', 1.30, 'DOLE 1.30 (special non-working)'],
            ['SPECIAL_HOLIDAY_UNWORKED', 0.00, 'DOLE 0.00'],
            ['SPECIAL_WORKING_DAY_WORKED', 1.30, 'DOLE 1.00 (an ordinary day); client says 1.30'],
            ['OT_ORDINARY', 1.00, 'DOLE 1.25'],
            ['OT_SPECIAL_HOLIDAY', 1.30, 'DOLE 1.69'],
            ['OT_REGULAR_HOLIDAY', 2.00, 'DOLE 2.60; not given by the client, set to 2.00 (to confirm)'],
            ['REGULAR_HOLIDAY_REST_DAY', 2.00, 'DOLE 2.60; undecided, set to the regular holiday rate'],
            ['DOUBLE_HOLIDAY', 2.00, 'DOLE 3.00; undecided, set to the regular holiday rate'],
        ];
        foreach ($rows as [$key, $value, $note]) {
            DB::table('pay_multipliers')->insert([
                'key' => $key, 'value' => $value, 'effective_date' => '2026-01-01', 'note' => $note,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        Schema::table('attendances', function (Blueprint $table) {
            $table->unsignedInteger('ot_minutes')->default(0)->after('late_minutes');
            $table->boolean('ot_approved')->default(false)->after('ot_minutes');
        });

        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('holiday_hours', 6, 2)->default(0)->after('unpaid_leave_hours');
            $table->decimal('ot_hours', 6, 2)->default(0)->after('holiday_hours');
            $table->decimal('holiday_pay', 10, 2)->default(0)->after('paid_leave_pay');
            $table->decimal('holiday_ot_pay', 10, 2)->default(0)->after('holiday_pay');
            $table->decimal('overtime_pay', 10, 2)->default(0)->after('holiday_ot_pay');
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', fn (Blueprint $t) => $t->dropColumn(['holiday_hours', 'ot_hours', 'holiday_pay', 'holiday_ot_pay', 'overtime_pay']));
        Schema::table('attendances', fn (Blueprint $t) => $t->dropColumn(['ot_minutes', 'ot_approved']));
        Schema::dropIfExists('pay_multipliers');
    }
};
