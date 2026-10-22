<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One entry in a support ticket's thread: a reply the customer sees in the
// portal, an internal note only the Admin sees, or the customer's own reply.
class SupportReply extends Model
{
    // kinds the Admin writes; the customer's replies are 'customer'
    public const KINDS = ['reply', 'note'];

    // kinds the customer sees in the portal
    public const CUSTOMER_VISIBLE = ['reply', 'customer'];

    protected $fillable = ['support_message_id', 'user_id', 'kind', 'body'];

    public function ticket()
    {
        return $this->belongsTo(SupportMessage::class, 'support_message_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
