<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Admin > Projects: a monday.com-style board of maintenance and plant jobs.
// Each project shows the supplies its stock-out requests used (released ones
// count as used, with their cost from the item's unit price), and Maintenance
// picks the project when filing a stock-out request.
//
// Maintenance adds a project (name, description, location: the job itself);
// Admin then only sets what comes below them on the form: owner, budget,
// dates, status and priority (owner, 2026-10-17).
class ProjectController extends Controller
{
    // Fields only Maintenance sets (when adding the project).
    private const MAINTENANCE_FIELDS = ['name', 'description', 'location', 'latitude', 'longitude'];

    // Fields Admin edits.
    private const ADMIN_FIELDS = ['status', 'priority', 'owner', 'start_date', 'due_date', 'budget', 'geofence_radius_m'];

    private function rules(bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes|required';

        return [
            'name' => "{$req}|string|max:255",
            'description' => 'nullable|string|max:2000',
            // Address of the job site (text). Coordinates are kept for a possible geofence later.
            'location' => 'nullable|string|max:500',
            'latitude' => 'nullable|numeric|between:-90,90|required_with:longitude',
            'longitude' => 'nullable|numeric|between:-180,180|required_with:latitude',
            'geofence_radius_m' => 'nullable|integer|min:10|max:100000',
            'status' => ['sometimes', Rule::in(Project::STATUSES)],
            'priority' => ['sometimes', Rule::in(Project::PRIORITIES)],
            'owner' => 'nullable|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date|after_or_equal:start_date',
            'budget' => 'nullable|numeric|min:0|max:99999999',
        ];
    }

    private const MESSAGES = [
        'name.required' => 'Enter the project name.',
        'due_date.after_or_equal' => 'The due date cannot be before the start date.',
        'status.in' => 'Choose a status from the list.',
        'priority.in' => 'Choose a priority from the list.',
    ];

    // The board: every project with its supplies used, cost and progress.
    public function index()
    {
        $projects = Project::with(['stockOutRequests' => fn ($q) => $q->with('product:id,name,unit,unit_price', 'requestedBy:id,name')->latest()])
            ->orderByRaw("CASE status WHEN 'working' THEN 0 WHEN 'stuck' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END")
            ->orderBy('due_date')
            ->get();

        return response()->json($projects->map(fn ($p) => $this->withTotals($p)));
    }

    // Active projects for the Maintenance stock-out form (name only).
    public function options()
    {
        return response()->json(
            Project::whereIn('status', ['planned', 'working', 'stuck'])->orderBy('name')->get(['id', 'name', 'status', 'description'])
        );
    }

    // Maintenance: a new project. It starts as Planned; Admin fills in the rest.
    public function store(Request $request)
    {
        $rules = array_intersect_key($this->rules(true), array_flip(self::MAINTENANCE_FIELDS));
        $rules['description'] = 'required|string|max:2000';
        $rules['location'] = 'required|string|max:500';
        $data = $request->validate($rules, self::MESSAGES + [
            'description.required' => 'Describe the job.',
            'location.required' => 'Enter where the job is.',
        ]);
        $project = Project::create($data + ['status' => 'planned', 'priority' => 'medium', 'created_by' => $request->user()->id]);

        return response()->json($this->withTotals($project->load('stockOutRequests')), 201);
    }

    // Maintenance: the projects this person added.
    public function mine(Request $request)
    {
        $projects = Project::with('stockOutRequests')
            ->where('created_by', $request->user()->id)
            ->latest()
            ->get();

        return response()->json($projects->map(fn ($p) => $this->withTotals($p)));
    }

    // Admin: only the fields below name, description and location. Those
    // three are what Maintenance wrote and cannot be changed here.
    public function update(Request $request, Project $project)
    {
        if ($request->hasAny(self::MAINTENANCE_FIELDS)) {
            $locked = collect(self::MAINTENANCE_FIELDS)->filter(fn ($f) => $request->has($f) && (string) $request->input($f) !== (string) $project->{$f});
            if ($locked->isNotEmpty()) {
                return response()->json([
                    'message' => 'The project name, description and location are set by Maintenance and cannot be changed here.',
                    'errors' => $locked->mapWithKeys(fn ($f) => [$f => ['Set by Maintenance.']])->all(),
                ], 422);
            }
        }
        $rules = array_intersect_key($this->rules(false), array_flip(self::ADMIN_FIELDS));
        $data = $request->validate($rules, self::MESSAGES);
        $project->update($data);

        return response()->json($this->withTotals($project->fresh()->load('stockOutRequests.product')));
    }

    // A project with requests keeps its history: its requests just lose the link.
    public function destroy(Project $project)
    {
        $project->delete();

        return response()->json(['message' => 'Project deleted.']);
    }

    // Supplies used (released requests), still waiting (pending or approved),
    // their cost, budget left, and progress: the share of the time from start
    // to due date that has passed (done = 100).
    private function withTotals(Project $p): array
    {
        $reqs = $p->stockOutRequests;
        $released = $reqs->where('status', 'released');
        $cost = $released->sum(fn ($r) => (float) $r->quantity * (float) ($r->product?->unit_price ?? 0));

        $progress = null;
        if ($p->status === 'done') {
            $progress = 100;
        } elseif ($p->start_date && $p->due_date) {
            $span = max(1, $p->start_date->diffInDays($p->due_date));
            $progress = (int) max(0, min(100, round($p->start_date->diffInDays(now(), false) / $span * 100)));
        }

        return $p->toArray() + [
            'requests_total' => $reqs->count(),
            'requests_released' => $released->count(),
            'requests_waiting' => $reqs->whereIn('status', ['pending', 'approved'])->count(),
            'materials_cost' => round($cost, 2),
            'budget_left' => $p->budget !== null ? round((float) $p->budget - $cost, 2) : null,
            'overdue' => $p->status !== 'done' && $p->due_date && $p->due_date->lt(now()->startOfDay()),
            'progress' => $progress,
        ];
    }
}
