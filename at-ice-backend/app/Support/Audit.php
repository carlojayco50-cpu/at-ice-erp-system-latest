<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

// Audit log for sensitive actions: payroll status changes, kiosk overrides,
// leave approvals and rejections, deactivation and reactivation, settings.
// A failed write is logged but never stops the action itself.
class Audit
{
    public static function log(string $action, ?Model $subject = null, ?array $before = null, ?array $after = null): void
    {
        try {
            DB::table('audit_logs')->insert([
                'user_id' => auth()->id(),
                'action' => $action,
                'subject_type' => $subject ? class_basename($subject) : null,
                'subject_id' => $subject?->getKey(),
                'before' => $before === null ? null : json_encode($before),
                'after' => $after === null ? null : json_encode($after),
                'ip' => request()?->ip(),
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::warning("Audit log failed ({$action}): ".$e->getMessage());
        }
    }
}
