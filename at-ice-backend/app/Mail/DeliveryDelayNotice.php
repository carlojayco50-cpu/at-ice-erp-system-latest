<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Sent to a store when its delivery was moved to another driver (the usual
// driver is off), App\Support\DeliveryDispatch::notifyDelay.
class DeliveryDelayNotice extends Mailable
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
