<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0891b2;">Welcome to AT Ice</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
      Hi {{ $name }}, your customer portal account is ready. Sign in with:
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;width:40%;">Email</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;">{{ $email }}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;">One-time password</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;">{{ $password }}</td>
      </tr>
    </table>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">
      After you sign in, you will be asked to choose your own password.
      If you forget it later, click <b>Forgot password?</b> on the sign-in page.
    </p>
    <a href="{{ $loginUrl }}" style="display:inline-block;background:#06b6d4;color:#0f172a;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:8px;">Sign in</a>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Bella Erin Tube Ice · AT-ICE ERP. Do not share this password with anyone.</p>
  </div>
</body>
</html>
