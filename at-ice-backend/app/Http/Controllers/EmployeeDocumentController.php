<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Support\Audit;
use App\Support\Biodata;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

// Files attached to an employee's biodata (HR, owner 2026-10-20): resume or
// CV, 2x2 photo, NBI clearance, government IDs, diploma and others. Kept on
// the private disk and opened only through these routes.
class EmployeeDocumentController extends Controller
{
    private const MIMES = [
        'resume' => 'pdf,doc,docx',
        'photo' => 'jpg,jpeg,png,webp',
    ];

    public function index(Employee $employee)
    {
        return response()->json($employee->documents()->get());
    }

    public function store(Request $request, Employee $employee)
    {
        $type = $request->input('type');
        $request->validate([
            'type' => ['required', Rule::in(Biodata::DOCUMENT_TYPES)],
            'file' => 'required|file|max:10240|mimes:'.(self::MIMES[$type] ?? 'pdf,jpg,jpeg,png,webp'),
        ], [
            'file.max' => 'The file is too large. Use one up to 10 MB.',
            'file.mimes' => $type === 'photo' ? 'The 2x2 photo must be a picture (JPG, PNG or WebP).'
                : ($type === 'resume' ? 'Attach the resume as a PDF or a Word file.' : 'Attach a PDF or a picture (JPG, PNG or WebP).'),
        ]);

        $file = $request->file('file');
        $doc = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'type' => $type,
            'path' => $file->storeAs('employee-documents', Str::uuid().'.'.$file->extension(), 'local'),
            'original_name' => mb_substr(preg_replace('/[^\pL\pN ._()-]/u', '_', $file->getClientOriginalName()), 0, 255),
            'mime' => $file->getMimeType() ?: 'application/octet-stream',
            'size' => $file->getSize(),
            'uploaded_by' => $request->user()->id,
        ]);
        Audit::log('employee_document.added', $employee, null, ['type' => $type, 'name' => $doc->original_name]);

        return response()->json(['message' => "{$doc->original_name} attached.", 'document' => $doc], 201);
    }

    public function show(Employee $employee, EmployeeDocument $document)
    {
        abort_unless($document->employee_id === $employee->id && Storage::disk('local')->exists($document->path), 404);

        return Storage::disk('local')->response($document->path, $document->original_name, ['Content-Type' => $document->mime]);
    }

    public function destroy(Employee $employee, EmployeeDocument $document)
    {
        abort_unless($document->employee_id === $employee->id, 404);
        Storage::disk('local')->delete($document->path);
        $document->delete();
        Audit::log('employee_document.removed', $employee, ['type' => $document->type, 'name' => $document->original_name], null);

        return response()->json(['message' => "{$document->original_name} removed."]);
    }
}
