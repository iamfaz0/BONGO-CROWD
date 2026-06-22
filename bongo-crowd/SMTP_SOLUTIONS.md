# SMTP Configuration Solutions for BONGO-CROWD

## 🔴 Current Issue: Port 587 Blocked

Your DigitalOcean server is blocking outgoing SMTP connections on port 587. This is a common security measure by cloud providers.

## ✅ Solution 1: Use SendGrid (Recommended - Free Tier)

SendGrid allows sending emails via HTTP API (no SMTP port needed).

### Setup:

1. Sign up at https://signup.sendgrid.com/
2. Create an API Key at https://app.sendgrid.com/settings/api_keys
3. Update `.env`:

```bash
# SendGrid Configuration
export SMTP_HOST=smtp.sendgrid.net
export SMTP_PORT=587
export SMTP_USER=apikey
export SMTP_PASS='SG.your-api-key-here'
export SMTP_FROM=noreply@cyberhubtz.site
export SENDGRID_API_KEY='SG.your-api-key-here'
```

### Install SendGrid Package:

```bash
cd /root/.openclaw/workspace/bongo-crowd
npm install @sendgrid/mail
```

## ✅ Solution 2: Use Mailgun (Free Tier)

1. Sign up at https://signup.mailgun.com/new/signup
2. Get your API key
3. Update `.env`:

```bash
export SMTP_HOST=smtp.mailgun.org
export SMTP_PORT=587
export SMTP_USER=postmaster@cyberhubtz.site
export SMTP_PASS='your-mailgun-api-key'
export SMTP_FROM=noreply@cyberhubtz.site
```

## ✅ Solution 3: Use AWS SES (If you have AWS)

```bash
export SMTP_HOST=email-smtp.us-east-1.amazonaws.com
export SMTP_PORT=587
export SMTP_USER=YOUR-SMTP-USERNAME
export SMTP_PASS='YOUR-SMTP-PASSWORD'
export SMTP_FROM=noreply@cyberhubtz.site
```

## ✅ Solution 4: Request DigitalOcean to Open SMTP

Submit a support ticket to DigitalOcean asking them to unblock port 587 for your droplet.

## ✅ Solution 5: Use FastLipa for Notifications

Since you already have FastLipa integrated, you could send payment notifications via SMS or in-app notifications instead of email.

## 🧪 Quick Test After Setup

```bash
cd /root/.openclaw/workspace/bongo-crowd
source .env
node test-smtp-direct.js
```

## 📧 Current Status

| Service | Status | Port | Solution |
|---------|--------|------|----------|
| Gmail SMTP | ❌ Blocked | 587 | Use SendGrid |
| SendGrid | ✅ Available | 587/25/API | Recommended |
| Mailgun | ✅ Available | 587/API | Alternative |

## 🔧 Recommendation

**Use SendGrid** - It's free for 100 emails/day and works without SMTP port issues since it can use HTTP API as fallback.

Would you like me to:
1. Set up SendGrid integration?
2. Create an alternative notification system (in-app + SMS via FastLipa)?
