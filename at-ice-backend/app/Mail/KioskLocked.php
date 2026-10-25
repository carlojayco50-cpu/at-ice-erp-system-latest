<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Sent to every Admin and HR account when a kiosk locks after too many wrong PINs.
// Sent by the queue worker.
class KioskLocked extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $kiosk,
        public string $lockedAt,
        public string $ip,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "AT Ice: Attendance Station kiosk {$this->kiosk} is locked");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.kiosk-locked');
    }
}
