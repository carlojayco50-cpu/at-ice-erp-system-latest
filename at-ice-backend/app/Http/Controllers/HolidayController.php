<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// The holiday calendar (HR and Admin). Add, edit, delete, list by year.
class HolidayController extends Controller
{
    // GET /api/holidays?year=2026
    public function index(Request $request)
    {
        $year = (int) $request->input('year', now(config('atice.timezone'))->year);

        return response()->json([
            'year' => $year,
            'years' => Holiday::query()->distinct()->orderBy('year')->pluck('year'),
            'holidays' => Holiday::where('year', $year)->orderBy('date')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $holiday = Holiday::create($data + ['created_by' => $request->user()->id]);
        Audit::log('holiday.added', $holiday, null, $holiday->only(['date', 'name', 'type', 'is_double']));

        return response()->json($holiday, 201);
    }

    public function update(Request $request, $id)
    {
        $holiday = Holiday::findOrFail($id);
        $before = $holiday->only(['date', 'name', 'type', 'is_double']);
        $holiday->update($this->validated($request, $holiday->id));
        Audit::log('holiday.changed', $holiday, $before, $holiday->only(['date', 'name', 'type', 'is_double']));

        return response()->json($holiday);
    }

    public function destroy($id)
    {
        $holiday = Holiday::findOrFail($id);
        $holiday->delete();
        Audit::log('holiday.removed', $holiday, $holiday->only(['date', 'name', 'type']), null);

        return response()->json(['message' => "{$holiday->name} was removed."]);
    }

    private function validated(Request $request, ?int $ignore = null): array
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', Rule::unique('holidays', 'date')->ignore($ignore)],
            'name' => 'required|string|max:255',
            'type' => ['required', Rule::in(Holiday::TYPES)],
            'is_double' => 'nullable|boolean',
        ], [
            'date.unique' => 'There is already a holiday on this date. Edit it instead (tick "Two holidays on this date" if it is a double holiday).',
        ]);

        return $data + ['year' => (int) substr($data['date'], 0, 4), 'is_double' => (bool) ($data['is_double'] ?? false)];
    }
}
