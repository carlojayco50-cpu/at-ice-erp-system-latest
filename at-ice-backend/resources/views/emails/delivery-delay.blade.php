<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#d97706;">Your delivery may be delayed</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hello {{ $customerName }},</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">{{ $text }}</p>
    <p style="margin:0;font-size:14px;line-height:1.5;">You can follow delivery <span style="font-family:monospace;font-weight:bold;">{{ $deliveryNo }}</span> in the AT Ice customer portal. We are sorry for the wait.</p>
  </div>
</body>
</html>
