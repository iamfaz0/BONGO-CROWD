# SMTP Troubleshooting Guide

## Current Status
- **Host:** smtp.gmail.com
- **Port:** 587
- **User:** fadhilimbaga99@gmail.com
- **Status:** ❌ Connection Timeout

## Common Issues & Fixes

### 1. Gmail App Password Required
Gmail no longer allows "less secure apps". You MUST use an App Password:

1. Go to https://myaccount.google.com/security
2. Enable 2-Factor Authentication (required)
3. Go to "App passwords" (search for it)
4. Generate new app password for "Mail"
5. Copy the 16-character password
6. Update `.env` file:
   ```
   SMTP_PASS='xxxx xxxx xxxx xxxx'  # With or without spaces
   ```

### 2. Alternative: Use Mailgun (Recommended for Production)
Sign up at https://www.mailgun.com/ for free tier:
- 5,000 emails/month free
- Better deliverability
- Works immediately

Update `.env`:
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.com
SMTP_PASS=your-mailgun-api-key
SMTP_FROM=noreply@yourdomain.com
```

### 3. Alternative: Use SendGrid
Sign up at https://sendgrid.com/ for free tier:
- 100 emails/day free
- Reliable delivery

### 4. Test Gmail App Password

Verify your app password works:
```bash
curl -v --url 'smtps://smtp.gmail.com:465' \
  --ssl-reqd \
  --mail-from "your-email@gmail.com" \
  --mail-rcpt "recipient@example.com" \
  --upload-file email.txt \
  --user "your-email@gmail.com:your-app-password"
```

## Current Behavior
If SMTP fails, emails are logged to console (development mode).

## Next Steps
1. Generate Gmail App Password
2. Update SMTP_PASS in .env
3. Restart server
4. Test password reset or company approval

## Webhook Endpoint (FastLipa)
For payment notifications, configure in FastLipa dashboard:
```
https://cyberhubtz.site/payments/webhook/fastlipa
```
