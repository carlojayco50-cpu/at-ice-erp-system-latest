<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

// Checks that an email account really exists (not just its domain), so a
// typo like "pudayiee@gmail.com" is caught before a customer is saved.
// Answers "valid", "invalid" or "unknown" (the mail server would not say).
//
// With EMAIL_VERIFY_API_KEY set it asks QuickEmailVerification (free: 100
// checks a day), which works even where the hosting blocks port 25. Without
// a key the server asks the domain's mail server itself: it connects to the
// MX host on port 25 and asks whether it would accept mail for the address
// (RCPT TO), then quits without sending anything. An address on a domain
// that accepts every address ("catch-all") is "unknown". Results are cached
// for a day.
class EmailVerifier
{
    public function check(string $email): string
    {
        $email = mb_strtolower(trim($email));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'invalid';
        }

        $key = 'email-verify:'.sha1($email);
        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached;
        }

        $apiKey = config('services.email_verify.key');
        $result = $apiKey ? self::viaApi($email, $apiKey) : self::viaSmtp($email);

        // "unknown" is not cached, so the next try asks again.
        if ($result !== 'unknown') {
            Cache::put($key, $result, now()->addDay());
        }

        return $result;
    }

    private static function viaApi(string $email, string $apiKey): string
    {
        try {
            $r = Http::timeout(10)->get('https://api.quickemailverification.com/v1/verify', [
                'email' => $email, 'apikey' => $apiKey,
            ]);
        } catch (Throwable) {
            return 'unknown';
        }
        if (! $r->ok()) {
            return 'unknown';
        }
        if ($r->json('result') === 'invalid') {
            return 'invalid';
        }
        if ($r->json('result') === 'valid' && $r->json('accept_all') !== 'true' && $r->json('accept_all') !== true) {
            return 'valid';
        }

        return 'unknown';
    }

    private static function viaSmtp(string $email): string
    {
        $domain = substr(strrchr($email, '@'), 1);
        $hosts = [];
        foreach (@dns_get_record($domain, DNS_MX) ?: [] as $mx) {
            $hosts[$mx['target']] = $mx['pri'];
        }
        asort($hosts);
        $hosts = array_keys($hosts) ?: [$domain];

        foreach (array_slice($hosts, 0, 2) as $host) {
            $result = self::askHost($host, $email, $domain);
            if ($result !== null) {
                return $result;
            }
        }

        return 'unknown';
    }

    // null = could not talk to this host (try the next one).
    private static function askHost(string $host, string $email, string $domain): ?string
    {
        $socket = @stream_socket_client("tcp://{$host}:25", $errno, $errstr, 8);
        if (! $socket) {
            return null;
        }
        stream_set_timeout($socket, 8);

        $read = function () use ($socket): int {
            $code = 0;
            while (($line = fgets($socket, 1024)) !== false) {
                $code = (int) substr($line, 0, 3);
                if (($line[3] ?? ' ') !== '-') {
                    break;
                }
            }

            return $code;
        };
        $say = function (string $cmd) use ($socket, $read): int {
            fwrite($socket, $cmd."\r\n");

            return $read();
        };

        try {
            if ($read() !== 220) {
                return null;
            }
            $helo = parse_url(config('app.url'), PHP_URL_HOST) ?: 'atice.cloud';
            if ($say("EHLO {$helo}") !== 250 && $say("HELO {$helo}") !== 250) {
                return null;
            }
            if ($say('MAIL FROM:<verify@'.preg_replace('/^www\./', '', $helo).'>') !== 250) {
                return null;
            }

            $code = $say("RCPT TO:<{$email}>");
            if ($code >= 500 && $code < 600) {
                return 'invalid';
            }
            if ($code !== 250 && $code !== 251) {
                return 'unknown';
            }

            // A server that also accepts a made-up address accepts everything.
            $fake = 'no-such-user-'.bin2hex(random_bytes(6)).'@'.$domain;
            $fakeCode = $say("RCPT TO:<{$fake}>");

            return ($fakeCode === 250 || $fakeCode === 251) ? 'unknown' : 'valid';
        } finally {
            @fwrite($socket, "QUIT\r\n");
            @fclose($socket);
        }
    }
}
