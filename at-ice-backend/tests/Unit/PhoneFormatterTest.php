<?php

namespace Tests\Unit;

use App\Services\PhoneFormatter;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class PhoneFormatterTest extends TestCase
{
    public static function numbers(): array
    {
        return [
            'leading 0' => ['09166250633', '+639166250633'],
            'leading 0, dashes' => ['0917-123-4567', '+639171234567'],
            'already +63' => ['+639166250633', '+639166250633'],
            '+63 with spaces' => ['+63 916 625 0633', '+639166250633'],
            '63 without plus' => ['639166250633', '+639166250633'],
            'landline, brackets' => ['(02) 8123-4567', '+63281234567'],
        ];
    }

    #[DataProvider('numbers')]
    public function test_normalize_keeps_every_digit(string $input, string $expected): void
    {
        $result = PhoneFormatter::normalize($input);

        $this->assertSame($expected, $result);

        // Same digits as the input, only the leading 0 swapped for 63.
        $inputDigits = preg_replace('/\D/', '', $input);
        $resultDigits = preg_replace('/\D/', '', $result);
        $withoutPrefix = str_starts_with($inputDigits, '0') ? substr($inputDigits, 1) : preg_replace('/^63/', '', $inputDigits);
        $this->assertSame('63'.$withoutPrefix, $resultDigits);
    }

    public function test_a_number_in_another_format_is_not_changed(): void
    {
        $this->assertSame('8123456', PhoneFormatter::normalize('8123456'));
        $this->assertNull(PhoneFormatter::normalize(null));
    }

    public function test_mobile_and_landline_rules(): void
    {
        $this->assertSame(1, preg_match(PhoneFormatter::MOBILE_REGEX, '+639166250633'));
        $this->assertSame(0, preg_match(PhoneFormatter::MOBILE_REGEX, '+63916625063'));   // one digit short
        $this->assertSame(1, preg_match(PhoneFormatter::ANY_REGEX, '+63281234567'));
        $this->assertSame(0, preg_match(PhoneFormatter::ANY_REGEX, '+6381234567'));        // too short
    }
}
