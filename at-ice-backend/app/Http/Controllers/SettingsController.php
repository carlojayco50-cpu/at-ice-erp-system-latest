<?php

namespace App\Http\Controllers;

use App\Models\PayMultiplier;
use App\Support\Audit;
use App\Support\PayPeriod;
use App\Support\Settings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// Rates and rules (App\Support\Settings) and the audit log. Admin only.
class SettingsController extends Controller
{
    public function index()
    {
        return response()->json(Settings::all());
    }

    // PUT settings { "key": "...", "value": ... }
    public function update(Request $request)
    {
        $request->validate(['key' => 'required|string', 'value' => 'present']);
        $key = $request->input('key');
        if ($error = Settings::validate($key, $request->input('value'))) {
            throw ValidationException::withMessages(['value' => [$error]]);
        }
        Settings::set($key, Settings::cast($key, $request->input('value')), $request->user()->id);

        return response()->json(['key' => $key, 'value' => Settings::get($key)]);
    }

    // GET /api/pay-multipliers (Admin): each holiday/overtime rate in effect
    // today, with its DOLE note and the history of changes.
    public function multipliers()
    {
        $rows = PayMultiplier::orderBy('key')->orderByDesc('effective_date')->get()->groupBy('key');
        $today = now('Asia/Manila')->toDateString();

        return response()->json(collect(PayMultiplier::KEYS)->map(fn ($key) => [
            'key' => $key,
            'value' => PayMultiplier::rate($key, $today),
            'history' => ($rows[$key] ?? collect())->map(fn ($r) => $r->only(['value', 'effective_date', 'note']))->values(),
        ]));
    }

    // POST /api/pay-multipliers { key, value, effective_date } (Admin): a new
    // rate from a date; older payrolls keep the rate of their day.
    public function setMultiplier(Request $request)
    {
        $data = $request->validate([
            'key' => ['required', \Illuminate\Validation\Rule::in(PayMultiplier::KEYS)],
            'value' => 'required|numeric|min:0|max:10',
            'effective_date' => 'required|date_format:Y-m-d',
        ]);
        $before = PayMultiplier::rate($data['key'], $data['effective_date']);
        PayMultiplier::updateOrCreate(
            ['key' => $data['key'], 'effective_date' => $data['effective_date']],
            ['value' => $data['value'], 'created_by' => $request->user()->id, 'note' => PayMultiplier::where('key', $data['key'])->orderBy('effective_date')->value('note')]
        );
        Audit::log('pay_multiplier.changed', null, ['key' => $data['key'], 'value' => $before], $data);

        return response()->json(['message' => "{$data['key']} is {$data['value']} from {$data['effective_date']}."]);
    }

    // GET pay-period?date=Y-m-d : the cutoff containing a date (any role that
    // works with attendance or payroll; read-only start and end).
    public function payPeriod(Request $request)
    {
        $request->validate(['date' => 'required|date_format:Y-m-d']);

        return response()->json(PayPeriod::for($request->input('date')));
    }

    // GET audit-logs?action=&subject_type=&subject_id= : newest first.
    public function auditLogs(Request $request)
    {
        $logs = DB::table('audit_logs')
            ->leftJoin('users', 'users.id', '=', 'audit_logs.user_id')
            ->when($request->filled('action'), fn ($q) => $q->where('action', $request->input('action')))
            ->when($request->filled('subject_type'), fn ($q) => $q->where('subject_type', $request->input('subject_type')))
            ->when($request->filled('subject_id'), fn ($q) => $q->where('subject_id', $request->input('subject_id')))
            ->orderByDesc('audit_logs.id')
            ->limit(200)
            ->get(['audit_logs.*', 'users.name as user_name']);

        return response()->json($logs->map(function ($l) {
            $l->before = json_decode($l->before ?? 'null', true);
            $l->after = json_decode($l->after ?? 'null', true);

            return $l;
        }));
    }
}
