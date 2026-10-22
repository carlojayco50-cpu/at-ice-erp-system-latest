<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\EmployeeMemo;
use App\Models\EmployeeMemoFile;
use App\Support\Audit;
use App\Support\MemoEngine;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

// Disciplinary memos. HR (and Admin): reviews the automatic drafts for missed
// Time Outs, issues memos by hand (zero-tolerance offenses go straight to a
// Notice to Explain), attaches files, sends them to the employee's account,
// uploads the scanned wet-signed copy, and closes an investigation. The
// employee: reads their sent memos and acknowledges a verbal or first written
// warning. Every HR action is audited.
class EmployeeMemoController extends Controller
{
    private const EMPLOYEE_COLUMNS = 'employee:id,employee_id,first_name,middle_initial,last_name,suffix,position,user_id,no_timeout_count,investigation_status,deactivated_at';

    // GET /api/memos (HR): every memo, the employees to pick from, and the lists
    public function index()
    {
        MemoEngine::run(); // pick up missed Time Outs right away when HR opens the page

        return response()->json([
            'memos' => EmployeeMemo::with([self::EMPLOYEE_COLUMNS, 'files', 'issuer:id,name'])->latest()->limit(1000)->get(),
            'employees' => Employee::whereNull('deactivated_at')->orderBy('employee_id')
                ->get(['id', 'employee_id', 'first_name', 'middle_initial', 'last_name', 'suffix', 'position', 'user_id', 'no_timeout_count', 'investigation_status', 'investigation_since']),
            'violations' => collect(EmployeeMemo::VIOLATIONS)->map(fn ($v, $k) => ['key' => $k, 'label' => $v[0], 'category' => $v[1]])->values(),
            'levels' => collect(EmployeeMemo::LEVELS)->map(fn ($v, $k) => ['key' => $k, 'label' => $v])->values(),
        ]);
    }

    // GET /api/memos/draft-text?employee_id=&violation=&level=&incident_date= (HR):
    // the suggested level and letter for the Issue Memo form
    public function draftText(Request $request)
    {
        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'violation' => ['required', Rule::in(array_keys(EmployeeMemo::VIOLATIONS))],
            'level' => ['nullable', Rule::in(array_keys(EmployeeMemo::LEVELS))],
            'incident_date' => 'nullable|date',
        ]);
        $employee = Employee::findOrFail($data['employee_id']);
        $offense = EmployeeMemo::nextOffenseNo($employee->id, $data['violation']);
        $level = $this->levelFor($data['violation'], $data['level'] ?? null, $offense);
        $incident = Carbon::parse($data['incident_date'] ?? now()->toDateString());

        return response()->json([
            'offense_no' => $offense,
            'level' => $level,
            'subject' => EmployeeMemo::subjectFor($data['violation'], $level),
            'body' => EmployeeMemo::draftBody($employee, $data['violation'], $level, $incident, $offense),
        ]);
    }

    // POST /api/memos (HR, multipart): a memo issued by hand, saved as a draft
    // or sent at once, with any dropped files
    public function store(Request $request)
    {
        $data = $request->validate([
            'employee_id' => ['required', Rule::exists('employees', 'id')->whereNull('deactivated_at')],
            'violation' => ['required', Rule::in(array_keys(EmployeeMemo::VIOLATIONS))],
            'level' => ['nullable', Rule::in(array_keys(EmployeeMemo::LEVELS))],
            'incident_date' => 'required|date|before_or_equal:today',
            'subject' => 'required|string|max:255',
            'body' => 'required|string|min:20|max:10000',
            'send' => 'boolean',
            'files' => 'array|max:10',
            'files.*' => 'file|max:10240|mimes:'.EmployeeMemoFile::MIMES,
        ], ['files.*.mimes' => 'Files must be PDF, Word (.docx) or pictures (JPG, PNG, WebP).']);

        $offense = EmployeeMemo::nextOffenseNo($data['employee_id'], $data['violation']);
        $memo = DB::transaction(function () use ($request, $data, $offense) {
            $memo = EmployeeMemo::create([
                'memo_no' => EmployeeMemo::nextMemoNo(),
                'employee_id' => $data['employee_id'],
                'violation' => $data['violation'],
                'category' => EmployeeMemo::categoryOf($data['violation']),
                'level' => $this->levelFor($data['violation'], $data['level'] ?? null, $offense),
                'offense_no' => $offense,
                'status' => 'draft',
                'source' => 'manual',
                'subject' => trim($data['subject']),
                'body' => trim($data['body']),
                'incident_date' => $data['incident_date'],
            ]);
            $this->storeFiles($request, $memo, 'attachment');

            return $memo;
        });
        Audit::log('memo.create', $memo, null, $memo->only(['memo_no', 'employee_id', 'violation', 'level']));

        if ($request->boolean('send')) {
            $this->dispatch($request, $memo);
        }

        return response()->json($this->fresh($memo), 201);
    }

    // PATCH /api/memos/{memo} (HR): edit a draft before sending
    public function update(Request $request, EmployeeMemo $memo)
    {
        if ($memo->status !== 'draft') {
            return response()->json(['message' => 'Only a draft can be edited. Cancel the memo and issue a new one instead.'], 422);
        }
        $data = $request->validate([
            'level' => ['sometimes', Rule::in(array_keys(EmployeeMemo::LEVELS))],
            'subject' => 'sometimes|string|max:255',
            'body' => 'sometimes|string|min:20|max:10000',
            'incident_date' => 'sometimes|date|before_or_equal:today',
        ]);
        if ($memo->category === 'zero_tolerance') {
            unset($data['level']); // always a Notice to Explain
        }
        $before = $memo->only(array_keys($data));
        $memo->update($data);
        Audit::log('memo.update', $memo, $before, $data);

        return response()->json($this->fresh($memo));
    }

    // POST /api/memos/{memo}/send (HR): the draft reaches the employee's account
    public function send(Request $request, EmployeeMemo $memo)
    {
        if ($memo->status !== 'draft') {
            return response()->json(['message' => 'This memo was already sent.'], 422);
        }
        $this->dispatch($request, $memo);

        return response()->json($this->fresh($memo));
    }

    // POST /api/memos/{memo}/cancel (HR): a draft or a sent memo that should not
    // stand (kiosk down, wrong person); it no longer counts as an offense
    public function cancel(Request $request, EmployeeMemo $memo)
    {
        $data = $request->validate(['reason' => 'required|string|min:5|max:1000']);
        if (! in_array($memo->status, ['draft', 'sent', 'awaiting_physical'], true)) {
            return response()->json(['message' => 'An acknowledged or archived memo cannot be cancelled.'], 422);
        }
        $before = $memo->only(['status']);
        $memo->update([
            'status' => 'cancelled',
            'cancelled_by' => $request->user()->id,
            'cancelled_at' => now(),
            'cancel_reason' => trim($data['reason']),
        ]);
        if ($memo->violation === 'no_time_out' && $memo->employee && $memo->employee->no_timeout_count > 0) {
            $memo->employee->decrement('no_timeout_count');
        }
        Audit::log('memo.cancel', $memo, $before, ['status' => 'cancelled', 'reason' => $memo->cancel_reason]);

        return response()->json($this->fresh($memo));
    }

    // POST /api/memos/{memo}/files (HR, multipart): kind attachment (evidence,
    // letters) or signed_copy (the scanned wet-signed memo, which archives it)
    public function upload(Request $request, EmployeeMemo $memo)
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(EmployeeMemoFile::KINDS)],
            'files' => 'required|array|min:1|max:10',
            'files.*' => 'file|max:10240|mimes:'.EmployeeMemoFile::MIMES,
        ], ['files.*.mimes' => 'Files must be PDF, Word (.docx) or pictures (JPG, PNG, WebP).']);

        if ($memo->status === 'cancelled') {
            return response()->json(['message' => 'This memo was cancelled.'], 422);
        }
        if ($data['kind'] === 'signed_copy' && ! in_array($memo->status, ['awaiting_physical', 'sent', 'acknowledged'], true)) {
            return response()->json(['message' => 'Send the memo before uploading the signed copy.'], 422);
        }

        $names = $this->storeFiles($request, $memo, $data['kind']);
        if ($data['kind'] === 'signed_copy') {
            $before = $memo->only(['status']);
            $memo->update(['status' => 'archived', 'signed_at' => now()]);
            Audit::log('memo.signed', $memo, $before, ['status' => 'archived', 'files' => $names]);
        } else {
            Audit::log('memo.attach', $memo, null, ['files' => $names]);
        }

        return response()->json($this->fresh($memo));
    }

    // GET /api/memos/{memo}/files/{file} (HR)
    public function file(EmployeeMemo $memo, EmployeeMemoFile $file)
    {
        return $this->streamFile($memo, $file);
    }

    // POST /api/memos/{memo}/close-investigation (HR): the hearing is done; the
    // employee is no longer "Pending Investigation"
    public function closeInvestigation(Request $request, EmployeeMemo $memo)
    {
        $data = $request->validate(['outcome' => 'required|string|min:5|max:2000']);
        $employee = $memo->employee;
        if (! $employee || ! $employee->investigation_status) {
            return response()->json(['message' => 'This employee has no open investigation.'], 422);
        }
        $employee->update(['investigation_status' => null, 'investigation_since' => null]);
        Audit::log('memo.investigation_closed', $employee, ['investigation_status' => 'pending_investigation'], ['outcome' => trim($data['outcome']), 'memo_no' => $memo->memo_no]);

        return response()->json($this->fresh($memo));
    }

    // GET /api/my-memos (any employee with an account): memos HR has sent
    public function myIndex(Request $request)
    {
        $employee = Employee::where('user_id', $request->user()->id)->first();
        if (! $employee) {
            return response()->json([]);
        }

        return response()->json(
            EmployeeMemo::where('employee_id', $employee->id)
                ->whereIn('status', EmployeeMemo::VISIBLE_TO_EMPLOYEE)
                ->with('files:id,employee_memo_id,kind,original_name,mime,size,created_at')
                ->latest('issued_at')->get()
                ->map(fn ($m) => $m->only(['id', 'memo_no', 'subject', 'body', 'violation_label', 'level', 'level_label', 'status', 'needs_physical', 'incident_date', 'issued_at', 'acknowledged_at', 'signed_at', 'files']))
        );
    }

    // POST /api/my-memos/{memo}/acknowledge: a verbal or first written warning
    public function acknowledge(Request $request, EmployeeMemo $memo)
    {
        $this->ownMemo($request, $memo);
        if ($memo->status !== 'sent') {
            return response()->json(['message' => $memo->status === 'awaiting_physical'
                ? 'This memo is signed in person. Please report to the HR office.'
                : 'This memo was already acknowledged.'], 422);
        }
        $memo->update(['status' => 'acknowledged', 'acknowledged_at' => now()]);
        Audit::log('memo.acknowledge', $memo, ['status' => 'sent'], ['status' => 'acknowledged']);

        return response()->json(['status' => 'acknowledged', 'acknowledged_at' => $memo->acknowledged_at]);
    }

    // GET /api/my-memos/{memo}/files/{file}
    public function myFile(Request $request, EmployeeMemo $memo, EmployeeMemoFile $file)
    {
        $this->ownMemo($request, $memo);

        return $this->streamFile($memo, $file);
    }

    private function ownMemo(Request $request, EmployeeMemo $memo): void
    {
        $employeeId = Employee::where('user_id', $request->user()->id)->value('id');
        abort_unless($employeeId && $memo->employee_id === $employeeId && in_array($memo->status, EmployeeMemo::VISIBLE_TO_EMPLOYEE, true), 404);
    }

    private function streamFile(EmployeeMemo $memo, EmployeeMemoFile $file)
    {
        abort_unless($file->employee_memo_id === $memo->id && Storage::disk('local')->exists($file->path), 404);

        return Storage::disk('local')->response($file->path, $file->original_name, ['Content-Type' => $file->mime ?: 'application/octet-stream']);
    }

    // Zero-tolerance offenses are always a Notice to Explain; otherwise HR's
    // choice, else the level for the offense number.
    private function levelFor(string $violation, ?string $level, int $offense): string
    {
        if (EmployeeMemo::categoryOf($violation) === 'zero_tolerance') {
            return 'nte';
        }

        return $level ?: EmployeeMemo::levelForOffense($offense);
    }

    private function dispatch(Request $request, EmployeeMemo $memo): void
    {
        $memo->loadMissing('employee');
        $status = $memo->needs_physical ? 'awaiting_physical' : 'sent';
        $memo->update(['status' => $status, 'issued_by' => $request->user()->id, 'issued_at' => now()]);

        // a Notice to Explain or a zero-tolerance offense opens an investigation
        if (($memo->level === 'nte' || $memo->category === 'zero_tolerance') && $memo->employee && ! $memo->employee->investigation_status) {
            $memo->employee->update(['investigation_status' => 'pending_investigation', 'investigation_since' => now()]);
        }
        Audit::log('memo.send', $memo, ['status' => 'draft'], ['status' => $status, 'level' => $memo->level]);
    }

    private function storeFiles(Request $request, EmployeeMemo $memo, string $kind): array
    {
        $names = [];
        foreach ((array) $request->file('files', []) as $file) {
            $memo->files()->create([
                'kind' => $kind,
                'path' => $file->storeAs('employee-memos', Str::uuid().'.'.$file->extension(), 'local'),
                'original_name' => mb_substr($file->getClientOriginalName(), 0, 255),
                'mime' => $file->getMimeType(),
                'size' => (int) $file->getSize(),
                'uploaded_by' => $request->user()->id,
            ]);
            $names[] = $file->getClientOriginalName();
        }

        return $names;
    }

    private function fresh(EmployeeMemo $memo): EmployeeMemo
    {
        return $memo->fresh([self::EMPLOYEE_COLUMNS, 'files', 'issuer:id,name']);
    }
}
