<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#dc2626;">A kiosk is locked</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">The Attendance Station kiosk below was locked after too many wrong PINs in a row. Nobody can record attendance on it until it is unlocked.</p>
    <table style="font-size:14px;line-height:1.6;">
      <tr><td style="color:#64748b;padding-right:12px;">Kiosk</td><td style="font-family:monospace;font-weight:bold;">{{ $kiosk }}</td></tr>
      <tr><td style="color:#64748b;padding-right:12px;">Locked at</td><td>{{ $lockedAt }}</td></tr>
      <tr><td style="color:#64748b;padding-right:12px;">IP address</td><td>{{ $ip }}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.5;">An Admin unlocks it by typing the Admin override PIN on that kiosk. If nobody at the store was entering the PIN, someone may be trying to guess it.</p>
  </div>
</body>
</html>
