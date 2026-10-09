<?php

namespace App\Support;

use App\Models;
use App\Models\LiveEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

// Realtime pop-up notices for every flow, module by module.
//
// Each watched model below says, for a create / update / delete, what the
// notice says and who gets it. AppServiceProvider hooks these into the model
// events, so every controller is covered without extra code. Rows go to
// live_events; the frontend (src/lib/live.js) polls GET live-feed every few
// seconds, pops up the new notices and refreshes the open page.
//
// Audience: roles ("hr", "driver", "customer", "employee:checker",
// "employee:salesman", "employee:maintenance") and/or user ids. Admin always
// gets every notice. The person who did the action never gets their own.
class LiveFeed
{
    /** Fields whose change counts as an update worth a notice (others are silent). */
    private const WATCH = [
        Models\LeaveRequest::class => ['status'],
        Models\StockOutRequest::class => ['status'],
        Models\Delivery::class => ['status', 'driver_id'],
        Models\Receipt::class => ['payment_status'],
        Models\Attendance::class => ['time_out'],
        Models\Applicant::class => ['status', 'interview_date'],
        Models\Payroll::class => ['status'],
        Models\StockMovement::class => ['status'],
        Models\SupportMessage::class => ['status'],
        Models\Product::class => ['name', 'is_active', 'unit_price', 'minimum_stock'],
        Models\CustomerPrice::class => ['unit_price'],
        Models\Employee::class => null, // null = any change
        Models\Supplier::class => null,
        Models\Customer::class => null,
        Models\Expense::class => null,
    ];

    public static function models(): array
    {
        return array_merge(array_keys(self::WATCH), [
            Models\DeliveryProof::class,
            Models\FaceData::class,
            Models\PickupLog::class,
            Models\IceLoading::class,
            Models\InventoryAlert::class,
        ]);
    }

    public static function record(Model $m, string $action): void
    {
        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            return; // migrations, seeders, artisan commands
        }

        try {
            if ($action === 'updated') {
                $watch = self::WATCH[get_class($m)] ?? [];
                if ($watch !== null && ! $m->wasChanged($watch)) {
                    return;
                }
            }

            $n = self::describe($m, $action);
            if (! $n) {
                return;
            }

            LiveEvent::create([
                'module' => $n[0],
                'action' => $action,
                'message' => mb_substr($n[1], 0, 255),
                'roles' => array_values($n[2] ?? []),
                'user_ids' => array_values(array_unique(array_filter($n[3] ?? []))),
                'actor_id' => auth()->id(),
            ]);

            // keep the table small: drop rows older than a week now and then (the
            // Admin dashboard lists the latest ones)
            if (random_int(1, 50) === 1) {
                LiveEvent::where('created_at', '<', now()->subDays(7))->delete();
            }
        } catch (Throwable $e) {
            Log::warning('LiveFeed: '.$e->getMessage());
        }
    }

    private static function label(?string $v): string
    {
        return ucwords(str_replace('_', ' ', (string) $v));
    }

    /** @return array|null [module, message, roles, user ids] */
    private static function describe(Model $m, string $a): ?array
    {
        $actor = auth()->user()?->name;
        $by = $actor ? " by {$actor}" : '';
        $verb = ['created' => 'added', 'updated' => 'updated', 'deleted' => 'removed'][$a];

        switch (get_class($m)) {
            case Models\LeaveRequest::class:
                $emp = $m->employee;
                $name = $emp?->full_name ?? 'An employee';
                $type = self::label($m->leave_type);
                if ($a === 'created') {
                    return ['leave', "New leave request: {$name} ({$type})", ['hr']];
                }
                if ($a === 'updated') {
                    return ['leave', "Leave request of {$name} ".self::label($m->status).$by, ['hr'], [$emp?->user_id]];
                }

                return ['leave', "Leave request of {$name} was cancelled", ['hr']];

            case Models\Attendance::class:
                $name = $m->employee?->full_name ?? $m->faceData?->worker_name ?? 'An employee';
                if ($a === 'created') {
                    return ['attendance', "{$name} timed in", ['hr']];
                }
                if ($a === 'updated') {
                    return ['attendance', "{$name} timed out", ['hr']];
                }

                return ['attendance', "Attendance record of {$name} removed{$by}", ['hr']];

            case Models\Employee::class:
                return ['employees', "Employee {$m->full_name} {$verb}{$by}", ['hr']];

            case Models\FaceData::class:
                $name = $m->employee?->full_name ?? $m->worker_name ?? 'an employee';

                return ['face', $a === 'deleted' ? "Face enrollment of {$name} removed{$by}" : "Face enrolled for {$name}{$by}", ['hr']];

            case Models\Applicant::class:
                if ($a === 'updated') {
                    return ['applicants', "Applicant {$m->name}: ".self::label($m->status), ['hr']];
                }

                return ['applicants', "Applicant {$m->name} {$verb}{$by}", ['hr']];

            case Models\Payroll::class:
                $emp = $m->employee;
                $name = $emp?->full_name ?? 'an employee';
                if ($a === 'updated') {
                    return ['payroll', "Payroll of {$name} ".self::label($m->status), ['hr'], [$emp?->user_id]];
                }

                return ['payroll', "Payroll for {$name} {$verb}{$by}", ['hr']];

            case Models\StockOutRequest::class:
                $what = "{$m->quantity} x {$m->item_name}";
                if ($a === 'created') {
                    return ['stock-out', "New stock-out request: {$what}".($actor ? " from {$actor}" : ''), ['employee:checker']];
                }
                if ($a === 'updated') {
                    return ['stock-out', "Stock-out request ({$what}) ".self::label($m->status).$by, ['employee:checker'], [$m->requested_by]];
                }

                return ['stock-out', "Stock-out request ({$what}) removed", [], [$m->requested_by]];

            case Models\Delivery::class:
                $no = $m->delivery_no ?: "#{$m->id}";
                $users = [$m->driver_id, $m->customer?->user_id];
                $roles = ['employee:salesman', 'employee:checker'];
                if ($a === 'created') {
                    return ['deliveries', "New delivery {$no} scheduled", $roles, $users];
                }
                if ($a === 'updated' && $m->wasChanged('driver_id') && ! $m->wasChanged('status')) {
                    return ['deliveries', "Delivery {$no} assigned to ".($m->driver?->name ?? 'a driver'), $roles, $users];
                }
                if ($a === 'updated') {
                    return ['deliveries', "Delivery {$no} is now ".self::label($m->status), $roles, $users];
                }

                return ['deliveries', "Delivery {$no} removed", $roles, $users];

            case Models\DeliveryProof::class:
                if ($a !== 'created') {
                    return null;
                }
                $d = $m->delivery;

                return ['deliveries', 'Delivery '.($d?->delivery_no ?: "#{$m->delivery_id}").' confirmed with photo proof'.$by,
                    ['employee:checker'], [$d?->driver_id, $d?->customer?->user_id]];

            case Models\Receipt::class:
                $cust = $m->customer?->user_id;
                if ($a === 'created') {
                    return ['receipts', "Receipt {$m->receipt_no} generated", [], [$cust, $m->salesman_id]];
                }
                if ($a === 'updated') {
                    return ['receipts', "Receipt {$m->receipt_no}: ".self::label($m->payment_status), [], [$cust]];
                }

                return ['receipts', "Receipt {$m->receipt_no} removed", [], [$cust]];

            case Models\IceLoading::class:
                if ($a !== 'created') {
                    return null;
                }
                $d = $m->delivery;

                return ['deliveries', "{$m->quantity_loaded} ".self::label($m->product_type).' loaded for delivery '.($d?->delivery_no ?: "#{$m->delivery_id}"),
                    ['employee:salesman'], [$d?->driver_id]];

            case Models\Product::class:
                return ['inventory', "Item {$m->name} {$verb}{$by}", ['employee:checker', 'employee:maintenance']];

            case Models\InventoryAlert::class:
                if ($a !== 'created') {
                    return null;
                }

                return ['inventory', $m->message ?: 'Low stock: '.($m->product?->name ?? 'an item'), ['employee:checker', 'employee:maintenance']];

            case Models\StockMovement::class:
                $item = $m->product?->name ?? 'an item';
                if ($a === 'created') {
                    return ['inventory', 'Stock '.($m->type === 'out' ? 'out' : 'in').": {$m->quantity} x {$item}{$by}", ['employee:checker']];
                }
                if ($a === 'updated') {
                    return ['inventory', "Stock movement ({$item}) ".self::label($m->status).$by, ['employee:checker'], [$m->entered_by]];
                }

                return null;

            case Models\Supplier::class:
                return ['suppliers', "Supplier {$m->name} {$verb}{$by}", ['employee:checker']];

            case Models\PickupLog::class:
                if ($a !== 'created') {
                    return null;
                }

                return ['pickups', "Pickup logged: {$m->quantity} ".self::label($m->product_type)." for {$m->company_name}", ['employee:checker']];

            case Models\Customer::class:
                return ['customers', "Customer {$m->name} {$verb}{$by}", [], $a === 'updated' ? [$m->user_id] : []];

            case Models\CustomerPrice::class:
                if ($a === 'deleted') {
                    return null;
                }

                return ['prices', 'Price for '.self::label($m->product_type).' set to PHP '.number_format((float) $m->unit_price, 2), [], [$m->customer?->user_id]];

            case Models\SupportMessage::class:
                if ($a === 'created') {
                    return ['support', 'New support message from '.($m->customer?->name ?? 'a customer').': '.$m->topic_label, []];
                }
                if ($a === 'updated') {
                    return ['support', "Your support message ({$m->topic_label}) was ".self::label($m->status), [], [$m->user_id]];
                }

                return null;

            case Models\Expense::class:
                return ['expenses', 'Expense '.self::label($m->category)." {$verb}{$by}", []];
        }

        return null;
    }
}
