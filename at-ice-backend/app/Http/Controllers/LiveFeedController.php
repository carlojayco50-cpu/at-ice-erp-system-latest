<?php

namespace App\Http\Controllers;

use App\Models\LiveEvent;
use App\Support\ArchiveExpiry;
use App\Support\DeliveryDispatch;
use App\Support\MemoEngine;
use App\Support\PayrollCalendar;
use Illuminate\Http\Request;

class LiveFeedController extends Controller
{
    // GET live-feed?after=ID
    // Without "after" it only returns the latest id, so a page that just opened
    // starts from now and does not replay old events.
    public function index(Request $request)
    {
        $user = $request->user();
        $after = $request->query('after');

        // There is no scheduler: the poll sends the payroll cut-off notice
        // (once per period) and applies the archive expiry (once a day) while
        // HR or Admin is online.
        if (in_array($user->role, ['hr', 'admin'], true)) {
            PayrollCalendar::notifyCutoff();
            ArchiveExpiry::daily();
            MemoEngine::run(); // missed Time Outs -> draft memos for HR (every 10 minutes)
        }

        // Driver leaves, the delivery queue and store delay notices
        // (App\Support\DeliveryDispatch, at most every 15 seconds).
        if (in_array($user->role, ['admin', 'hr', 'driver', 'employee'], true)) {
            DeliveryDispatch::run();
        }

        if ($after === null || $after === '') {
            return response()->json(['last_id' => (int) LiveEvent::max('id'), 'events' => []]);
        }

        $rows = LiveEvent::where('id', '>', (int) $after)->orderBy('id')->limit(100)->get();

        $events = $rows
            ->filter(fn ($e) => $e->actor_id !== $user->id && $e->isFor($user))
            ->map(fn ($e) => [
                'id' => $e->id,
                'module' => $e->module,
                'action' => $e->action,
                'message' => $e->message,
                'created_at' => $e->created_at,
            ])
            ->values();

        return response()->json([
            'last_id' => (int) ($rows->max('id') ?? $after),
            'events' => $events,
        ]);
    }
}
