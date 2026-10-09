<?php

namespace App\Rules;

use App\Services\EmailVerifier;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

// Refuses an email whose account does not exist (see EmailVerifier). An
// address the mail server will not confirm either way ("unknown", e.g. most
// Yahoo and Outlook addresses) is allowed.
class ExistingMailbox implements ValidationRule
{
    public const MESSAGE = 'This email account does not exist. Check the spelling, e.g. name@gmail.com.';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && app(EmailVerifier::class)->check($value) === 'invalid') {
            $fail(self::MESSAGE);
        }
    }
}
