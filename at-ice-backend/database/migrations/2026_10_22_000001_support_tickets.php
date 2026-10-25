<?php

use App\Models\SupportMessage;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Customer messages become support tickets: a ticket number, a priority,
// who handles it, a resolution note, and a thread of replies (seen by the
// customer) and internal notes (Admin only).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('support_messages', function (Blueprint $table) {
            $table->string('ticket_no', 30)->nullable()->unique()->after('id');
            $table->string('priority', 10)->default('medium')->after('topic'); // low | medium | high
            $table->foreignId('assigned_to')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->text('resolution_note')->nullable()->after('resolved_at');
            $table->timestamp('closed_at')->nullable()->after('resolution_note');
        });

        Schema::create('support_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_message_id')->constrained('support_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind', 10); // reply (customer sees it) | note (Admin only)
            $table->text('body');
            $table->timestamps();

            $table->index(['support_message_id', 'created_at']);
        });

        // existing messages get a ticket number (per day, oldest first) and a priority from their topic
        $perDay = [];
        foreach (DB::table('support_messages')->orderBy('created_at')->orderBy('id')->get(['id', 'topic', 'created_at']) as $row) {
            $day = date('Ymd', strtotime($row->created_at));
            $perDay[$day] = ($perDay[$day] ?? 0) + 1;
            DB::table('support_messages')->where('id', $row->id)->update([
                'ticket_no' => sprintf('TKT-%s-%03d', $day, $perDay[$day]),
                'priority' => SupportMessage::priorityFor($row->topic),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('support_replies');
        Schema::table('support_messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assigned_to');
            $table->dropUnique(['ticket_no']);
            $table->dropColumn(['ticket_no', 'priority', 'resolution_note', 'closed_at']);
        });
    }
};
