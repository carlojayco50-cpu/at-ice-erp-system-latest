<?php

namespace App\Rules;

use App\Services\EmailVerifier;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

// Refuses an email whose account does not exist (see EmailVerifier). An
// address the mail server will not confirm either way ("unknown", e.g. most
// Yahoo and Outlook addresses) is allowed. A company address (@atice.cloud,
// @atice.com) is never a customer's own mailbox, so it is refused too.
class ExistingMailbox implements ValidationRule
{
    public const MESSAGE = 'This email account does not exist. Check the spelling, e.g. name@gmail.com.';

    public const COMPANY_DOMAINS = ['atice.cloud', 'atice.com'];

    public const COMPANY_MESSAGE = "Use the customer's own email (e.g. Gmail), not an @atice.cloud address.";

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            return;
        }

        $domain = mb_strtolower(trim((string) substr(strrchr($value, '@') ?: '', 1)));
        if (in_array($domain, self::COMPANY_DOMAINS, true)) {
            $fail(self::COMPANY_MESSAGE);

            return;
        }

        if (app(EmailVerifier::class)->check($value) === 'invalid') {
            $fail(self::MESSAGE);
        }
    }
}
