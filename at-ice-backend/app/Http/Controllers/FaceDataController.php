<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FaceData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class FaceDataController extends Controller
{
    // Guards and Baggers have no system account. They are linked to their
    // employee record (HRIS > Employees); older enrollments may have none.
    // Every other role must be linked to an employee.

    // The face picture comes from the webcam as a JPEG data URL (up to ~1.5 MB).
    private const PHOTO_RULE = ['nullable', 'string', 'max:2000000', 'starts_with:data:image/jpeg;base64,'];

    // Saves the picture on the public disk (served at /storage/face-photos/...)
    // under a random name, and returns its path.
    private function storePhoto(?string $dataUrl): ?string
    {
        if (! $dataUrl) {
            return null;
        }
        $bytes = base64_decode(substr($dataUrl, strlen('data:image/jpeg;base64,')), true);
        if ($bytes === false || @getimagesizefromstring($bytes) === false) {
            throw ValidationException::withMessages(['photo' => 'The face picture could not be read. Capture it again.']);
        }
        $path = 'face-photos/'.Str::uuid().'.jpg';
        Storage::disk('public')->put($path, $bytes);

        return $path;
    }

    private function deletePhoto(?string $path): void
    {
        if ($path) {
            Storage::disk('public')->delete($path);
        }
    }

    // HR enrolls a worker's face
    // POST /api/face-enroll
    public function enroll(Request $request)
    {
        $validated = $request->validate([
            'worker_name' => 'required|string|max:255',
            'role' => 'required|in:driver,salesman,checker,maintenance,guard,bagger',
            'employee_id' => [
                'nullable',
                'required_unless:role,guard,bagger',
                'exists:employees,id',
                // One face per employee: stops a second enrollment that
                // would mix two people's attendance under one employee.
                Rule::unique('face_data', 'employee_id'),
            ],
            'descriptor' => 'required|array|size:128',
            'descriptor.*' => 'numeric',
            'photo' => self::PHOTO_RULE,
        ], [
            'employee_id.unique' => 'This employee already has an enrolled face. Delete the existing enrollment first if it needs to be redone.',
            'employee_id.required_unless' => 'Select the employee for this worker.',
            'employee_id.exists' => 'The selected employee was not found.',
        ]);

        // The role must match the employee's actual role in the system
        if (! empty($validated['employee_id'])) {
            $employee = Employee::with('user')->find($validated['employee_id']);
            $actual = match (true) {
                $employee?->user === null => strtolower((string) $employee?->position), // guard, bagger
                $employee->user->role === 'driver' => 'driver',
                default => $employee->user->sub_role,
            };

            if ($actual && $actual !== $validated['role']) {
                return response()->json([
                    'message' => "Role does not match this employee. {$employee->first_name} {$employee->last_name} is registered as ".ucfirst($actual).'.',
                    'errors' => ['role' => ['Role does not match the selected employee.']],
                ], 422);
            }
        }

        $photo = $validated['photo'] ?? null;
        unset($validated['photo']);
        $faceData = FaceData::create($validated + ['photo_path' => $this->storePhoto($photo)]);

        return response()->json([
            'message' => 'Face enrolled successfully.',
            'face_data' => $faceData,
        ], 201);
    }

    // List all enrolled faces
    // GET /api/face-data
    public function index()
    {
        return response()->json(FaceData::with('employee')->latest()->get());
    }

    // Re-enroll / update face descriptor
    // PUT /api/face-data/{id}
    public function update(Request $request, $id)
    {
        $faceData = FaceData::findOrFail($id);

        $validated = $request->validate([
            'descriptor' => 'required|array|size:128',
            'descriptor.*' => 'numeric',
            'photo' => self::PHOTO_RULE,
        ]);

        $data = ['descriptor' => $validated['descriptor']];
        if (! empty($validated['photo'])) {
            // A new picture replaces the old one
            $old = $faceData->photo_path;
            $data['photo_path'] = $this->storePhoto($validated['photo']);
            $this->deletePhoto($old);
        }
        $faceData->update($data);

        return response()->json([
            'message' => 'Face data updated.',
            'face_data' => $faceData,
        ]);
    }

    // Delete enrolled face
    // DELETE /api/face-data/{id}
    // A face that already has attendance records is not deleted, so the
    // history stays linked to the right worker. HR re-enrolls it instead.
    public function destroy($id)
    {
        $faceData = FaceData::findOrFail($id);

        if (Attendance::where('face_data_id', $faceData->id)->exists()) {
            return response()->json([
                'message' => "{$faceData->worker_name} already has attendance records, so the enrollment cannot be deleted. Use Re-enroll to replace the face instead.",
            ], 422);
        }

        $this->deletePhoto($faceData->photo_path);
        $faceData->delete();

        return response()->json(['message' => 'Face data deleted.']);
    }

    // Serve the descriptors to AttendanceStation for matching
    // GET /api/face-descriptors
    // A deactivated employee's face is left out, so they can no longer time in.
    // Older enrollments with no employee link are still served.
    public function descriptors()
    {
        return response()->json(
            FaceData::select('id', 'worker_name', 'role', 'employee_id', 'descriptor')
                ->where(fn ($q) => $q->whereNull('employee_id')
                    ->orWhereHas('employee', fn ($e) => $e->where('is_active', true)))
                ->get()
        );
    }
}
