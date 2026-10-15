<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Groq AI (Admin Dashboard AI Summary). Read through config so the key
    // still works in production after "php artisan config:cache".
    'groq' => [
        'key' => env('GROQ_API_KEY'),
        // Reads addresses from uploaded resumes and IDs (DocumentScanController).
        'vision_model' => env('GROQ_VISION_MODEL', 'qwen/qwen3.8-27b'),
        // Reads the text of a PDF or Word resume (same model unless set).
        'text_model' => env('GROQ_TEXT_MODEL', env('GROQ_VISION_MODEL', 'qwen/qwen3.8-27b')),
    ],

    // Bi-weekly payroll: periods of 14 days counted from this Monday
    // (App\Support\PayrollCalendar).
    'payroll' => [
        'anchor' => env('PAYROLL_ANCHOR', '2026-01-05'),
    ],

    // OpenStreetMap Nominatim (App\Services\Nominatim). Its usage policy needs a
    // User-Agent that names the app and a way to contact us.
    'nominatim' => [
        'user_agent' => env('NOMINATIM_USER_AGENT', 'AT-ICE-ERP/1.0 (STI SJDM Capstone Project; contact: rhalfgigi12345678@gmail.com)'),
    ],

    // Customer email check (App\Services\EmailVerifier). Optional: without a
    // key the server asks the mail server itself on port 25.
    'email_verify' => [
        'key' => env('EMAIL_VERIFY_API_KEY'),
    ],
];
