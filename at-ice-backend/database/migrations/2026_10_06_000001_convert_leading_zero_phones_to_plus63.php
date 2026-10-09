<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

// Phone numbers are now stored with the +63 prefix. This replaces ONLY the
// leading 0 with +63 and leaves the rest of the number exactly as it was
// (09171234567 -> +639171234567, 0917-123-4567 -> +63917-123-4567).
// Numbers that do not start with 0 are not touched. Running it twice is safe,
// because converted numbers no longer start with 0.
//
// Every row is checked after it is written: the digits must be exactly the old
// digits minus the leading 0, with 63 in front. If they are not, the migration
// stops. Each change is also written to the log (old value -> new value), so a
// number can always be traced back.
return new class extends Migration
{
    private const COLUMNS = [
        'employees' => 'phone',
        'applicants' => 'phone',
        'suppliers' => 'contact_number',
        'customers' => 'contact_number',
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            DB::table($table)
                ->where($column, 'like', '0%')
                ->chunkById(200, function ($rows) use ($table, $column) {
                    foreach ($rows as $row) {
                        $old = $row->{$column};
                        $new = '+63'.substr($old, 1);

                        DB::table($table)->where('id', $row->id)->update([$column => $new]);

                        $saved = DB::table($table)->where('id', $row->id)->value($column);
                        if ($saved !== $new
                            || preg_replace('/\D/', '', $saved) !== '63'.substr(preg_replace('/\D/', '', $old), 1)) {
                            throw new RuntimeException(
                                "Phone conversion changed a digit in {$table}.{$column} id {$row->id}: '{$old}' became '{$saved}'."
                            );
                        }

                        Log::info("Phone converted {$table}.{$column} id {$row->id}: '{$old}' -> '{$saved}'");
                    }
                });
        }
    }

    // Puts the leading 0 back on numbers that start with +63.
    public function down(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            DB::table($table)
                ->where($column, 'like', '+63%')
                ->chunkById(200, function ($rows) use ($table, $column) {
                    foreach ($rows as $row) {
                        DB::table($table)
                            ->where('id', $row->id)
                            ->update([$column => '0'.substr($row->{$column}, 3)]);
                    }
                });
        }
    }
};
