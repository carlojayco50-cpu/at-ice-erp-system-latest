<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0891b2;">Reset your password</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Enter this code on the AT Ice sign-in page to choose a new password:</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace;text-align:center;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">{{ $code }}</div>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.5;">The code works for {{ $minutes }} minutes and only once.</p>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">If you did not ask to reset your password, ignore this email; your password stays the same. Never share this code with anyone.</p>
  </div>
</body>
</html>
