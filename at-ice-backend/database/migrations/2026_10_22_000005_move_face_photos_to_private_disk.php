<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

// Face pictures are biometric data: move the ones saved on the public disk
// (served at /storage) to the private disk; HR opens them through
// GET face-data/{id}/photo. The path in face_data stays the same.
return new class extends Migration
{
    public function up(): void
    {
        $public = Storage::disk('public');
        $private = Storage::disk('local');
        foreach (DB::table('face_data')->whereNotNull('photo_path')->pluck('photo_path') as $path) {
            if ($public->exists($path)) {
                if (! $private->exists($path)) {
                    $private->put($path, $public->get($path));
                }
                $public->delete($path);
            }
        }
    }

    public function down(): void
    {
        // the pictures stay private
    }
};
