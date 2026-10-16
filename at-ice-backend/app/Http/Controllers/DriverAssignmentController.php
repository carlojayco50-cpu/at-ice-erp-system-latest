<?php

namespace App\Http\Controllers;

use App\Models\Delivery;
use App\Models\DriverLeave;
use App\Models\DriverStoreAssignment;
use App\Models\LiveEvent;
use App\Models\User;
use App\Support\Audit;
use App\Support\DeliveryDispatch;
use App\Support\DriverAvailability;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// Admin picks which Driver handles which stores (semi-manual assignment), and
// records a Driver who is absent, on emergency leave or on a rest day; the
// system then reassigns that Driver's deliveries (App\Support\DeliveryDispatch).
class DriverAssignmentController extends Controller
{
    // Assignments that are current or start later.
    public function index()
    {
        return response()->json(
            DriverStoreAssignment::with(['driver:id,name', 'store:id,name,chain,branch_code'])
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', DriverAvailability::today()))
                ->orderBy('effective_from')
                ->get()
        );
    }

    // Driver X handles these stores from a date (usually the next week or pay
    // period). Each store's earlier assignment ends the day before; one that
    // would only start later is replaced.
    public function store(Request $request)
    {
        $data = $request->validate([
            'driver_id' => ['required', Rule::exists('users', 'id')->where('role', 'driver')],
            'store_ids' => 'required|array|min:1',
            'store_ids.*' => 'integer|distinct|exists:customers,id',
            'effective_from' => 'required|date|after_or_equal:today',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
        ], ['driver_id.exists' => 'Please select a driver.', 'store_ids.required' => 'Pick at least one store.']);

        $from = Carbon::parse($data['effective_from'])->toDateString();
        $dayBefore = Carbon::parse($from)->subDay()->toDateString();
        $moved = 0;

        $made = DB::transaction(function () use ($data, $from, $dayBefore, $request, &$moved) {
            $made = [];
            foreach ($data['store_ids'] as $storeId) {
                $open = DriverStoreAssignment::where('store_id', $storeId)
                    ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $from))
                    ->lockForUpdate()
                    ->get();
                foreach ($open as $old) {
                    $old->effective_from->toDateString() >= $from
                        ? $old->delete()
                        : $old->update(['effective_to' => $dayBefore]);
                }

                $a = DriverStoreAssignment::create([
                    'driver_id' => $data['driver_id'],
                    'store_id' => $storeId,
                    'effective_from' => $from,
                    'effective_to' => $data['effective_to'] ?? null,
                    'created_by' => $request->user()->id,
                ]);
                $moved += DeliveryDispatch::applyAssignment($a);
                $made[] = $a;
            }

            return $made;
        });

        $driver = User::find($data['driver_id']);
        $count = count($made);
        LiveEvent::create([
            'module' => 'deliveries',
            'action' => 'updated',
            'message' => "{$driver->name} now handles {$count} ".($count === 1 ? 'store' : 'stores').' from '.Carbon::parse($from)->format('M j'),
            'roles' => ['employee:salesman', 'employee:checker'],
            'user_ids' => [$driver->id],
            'actor_id' => $request->user()->id,
        ]);
        Audit::log('driver_assignment.saved', $driver, null, $data + ['deliveries_updated' => $moved]);

        return response()->json([
            'message' => "{$driver->name} was assigned {$count} ".($count === 1 ? 'store' : 'stores').". {$moved} upcoming deliveries now go to them.",
            'assignments' => $made,
        ], 201);
    }

    // Ends an assignment: one that has not started is removed, a current one
    // ends yesterday. The store's deliveries after today have no driver until
    // Admin assigns one.
    public function destroy($id)
    {
        $a = DriverStoreAssignment::findOrFail($id);
        $today = DriverAvailability::today();
        $yesterday = Carbon::parse($today)->subDay()->toDateString();

        DB::transaction(function () use ($a, $today, $yesterday) {
            Delivery::where('customer_id', $a->store_id)
                ->where('driver_id', $a->driver_id)
                ->where('status', 'pending')
                ->whereNull('reassigned_from_driver_id')
                ->whereDate('scheduled_date', '>', $today)
                ->update(['driver_id' => null, 'updated_at' => now()]);

            $a->effective_from->toDateString() > $yesterday
                ? $a->delete()
                : $a->update(['effective_to' => $yesterday]);
        });
        Audit::log('driver_assignment.ended', $a);

        return response()->json(['message' => 'Assignment ended.']);
    }

    public function leaves(Request $request)
    {
        $from = $request->query('from', DriverAvailability::today());

        return response()->json(
            DriverLeave::with('driver:id,name')->whereDate('date', '>=', $from)->orderBy('date')->get()
        );
    }

    // A Driver is absent, on emergency leave or on a rest day. When it is
    // today, their pending deliveries are reassigned right away; a later day
    // is handled on that day.
    public function storeLeave(Request $request)
    {
        $data = $request->validate([
            'driver_id' => ['required', Rule::exists('users', 'id')->where('role', 'driver')],
            'date' => 'required|date|after_or_equal:today',
            'type' => ['required', Rule::in(array_keys(DriverLeave::TYPES))],
            'reason' => 'nullable|string|max:255',
        ], ['driver_id.exists' => 'Please select a driver.']);
        $date = Carbon::parse($data['date'])->toDateString();

        if (DriverLeave::where('driver_id', $data['driver_id'])->whereDate('date', $date)->exists()) {
            return response()->json(['message' => 'This driver is already marked off on that day.'], 422);
        }

        $leave = DriverLeave::create(['date' => $date, 'recorded_by' => $request->user()->id] + $data);
        Audit::log('driver_leave.created', $leave, null, $leave->only(['driver_id', 'date', 'type', 'reason']));

        $moved = DeliveryDispatch::reassign((int) $data['driver_id'], $date);
        if ($moved) {
            DeliveryDispatch::sendDelayNotices();
        }
        $queued = Delivery::where('status', 'queued')->where('reassigned_from_driver_id', $data['driver_id'])->whereDate('scheduled_date', $date)->count();

        $text = $date === DriverAvailability::today()
            ? ($moved
                ? "{$moved} of their deliveries today were reassigned".($queued ? " ({$queued} queued until a driver is free)." : '.')
                : 'They have no pending deliveries today.')
            : 'Their deliveries that day will be reassigned on the day.';

        return response()->json(['message' => "Driver marked off. {$text}", 'leave' => $leave, 'reassigned' => $moved, 'queued' => $queued], 201);
    }

    // Removes the mark. Deliveries that were already reassigned keep their new Driver.
    public function destroyLeave($id)
    {
        $leave = DriverLeave::findOrFail($id);
        Audit::log('driver_leave.removed', $leave, $leave->only(['driver_id', 'date', 'type']));
        $leave->delete();

        return response()->json(['message' => 'Leave mark removed.']);
    }
}
