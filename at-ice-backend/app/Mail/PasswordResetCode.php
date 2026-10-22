<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// The 6-digit code for "Forgot password?" on the login page.
// Sent by the queue worker; encrypted while queued (it carries a secret).
class PasswordResetCode extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $code,
        public int $minutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Your AT Ice password reset code: {$this->code}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.password-reset-code');
    }
}
