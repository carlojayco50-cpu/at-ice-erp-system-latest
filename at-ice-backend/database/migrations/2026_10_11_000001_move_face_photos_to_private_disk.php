<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

// Face pictures were saved on the public disk, which nginx serves at /storage/
// without a login. They now live on the private disk (storage/app/private) and
// are sent only to HR and Admin (FaceDataController@photo).
//
// This moves the pictures already saved. The path stored in face_data.photo_path
// does not change, only the disk. Safe to run again: a picture is copied first,
// checked, and only then deleted from the public disk. A file that is missing is
// logged and skipped, and nothing else is touched.
return new class extends Migration
{
    public function up(): void
    {
        $this->move('public', 'local');
    }

    // Puts the pictures back on the public disk.
    public function down(): void
    {
        $this->move('local', 'public');
    }

    private function move(string $from, string $to): void
    {
        $source = Storage::disk($from);
        $target = Storage::disk($to);

        DB::table('face_data')->whereNotNull('photo_path')->orderBy('id')->each(function ($row) use ($source, $target, $from, $to) {
            $path = $row->photo_path;

            if (! $source->exists($path)) {
                if (! $target->exists($path)) {
                    Log::warning("Face picture {$path} (face_data id {$row->id}) was not found on the {$from} or {$to} disk.");
                }

                return; // already moved, or never there
            }

            $stream = $source->readStream($path);
            $target->writeStream($path, $stream);
            if (is_resource($stream)) {
                fclose($stream);
            }

            if (! $target->exists($path) || $target->size($path) !== $source->size($path)) {
                throw new RuntimeException("Could not copy face picture {$path} to the {$to} disk. Nothing was deleted.");
            }

            $source->delete($path);
            Log::info("Face picture {$path} moved from the {$from} disk to the {$to} disk.");
        });
    }
};
