<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Sent to a store when its delivery was moved to another driver (the usual
// driver is off), App\Support\DeliveryDispatch::notifyDelay.
// Sent by the queue worker.
class DeliveryDelayNotice extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $customerName,
        public string $deliveryNo,
        public string $text,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "AT Ice: delivery {$this->deliveryNo} may be delayed");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.delivery-delay');
    }
}
