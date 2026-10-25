<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Sent right after Admin adds a customer (or creates a customer's login):
// the login email and the one-time password, which must be changed on the
// first sign-in.
// Sent by the queue worker; encrypted while queued (it carries a secret).
class AccountCredentials extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $name,
        public string $email,
        public string $password,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your AT Ice customer portal account');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.account-credentials', with: [
            'loginUrl' => rtrim(config('app.url'), '/').'/login',
        ]);
    }
}
