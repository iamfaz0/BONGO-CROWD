# Supabase Setup Guide for BONGO-CROWD

## Step 1: Create Supabase Account

1. Go to: https://supabase.com
2. Click **Start your project**
3. Sign up with GitHub (recommended) or email
4. Verify your email if needed

## Step 2: Create New Project

1. Click **New Project**
2. Organization: Select or create new
3. Project name: `bongo-crowd`
4. Database password: **Generate a strong password** (save this!)
5. Region: Choose closest to your users (e.g., `us-east-1` for US, `eu-west-1` for Europe)
6. Click **Create new project**

Wait 2-3 minutes for the database to be created.

## Step 3: Get Database Connection String

1. In your Supabase dashboard, go to **Settings** (gear icon)
2. Click **Database**
3. Under **Connection string**, select **URI**
4. Copy the connection string

It will look like:
```
postgresql://postgres:YOUR_PASSWORD@db.XXXXXXXX.supabase.co:5432/postgres
```

**Replace `YOUR_PASSWORD` with the password you set in Step 2.**

## Step 4: Run Database Migrations

You have two options:

### Option A: Using Supabase SQL Editor (Easiest)

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New query**
3. Copy contents of these files from your repo:
   - `database/schema.sql`
   - `database/migrations/add_company_registration_fields.sql`
   - `database/migrations/add_email_notifications.sql`
   - `database/migrations/add_analytics_schema.sql`
   - `database/migrations/add_badge_reputation_system.sql`
   - `database/migrations/create_bounty_tables.sql`
4. Paste each file content and click **Run**
5. Do this for each migration file

### Option B: Using psql CLI

```bash
# Install psql if needed
# Then run:
psql "YOUR_SUPABASE_CONNECTION_STRING" -f database/schema.sql
psql "YOUR_SUPABASE_CONNECTION_STRING" -f database/migrations/add_company_registration_fields.sql
psql "YOUR_SUPABASE_CONNECTION_STRING" -f database/migrations/add_email_notifications.sql
psql "YOUR_SUPABASE_CONNECTION_STRING" -f database/migrations/add_analytics_schema.sql
psql "YOUR_SUPABASE_CONNECTION_STRING" -f database/migrations/add_badge_reputation_system.sql
psql "YOUR_SUPABASE_CONNECTION_STRING" -f database/migrations/create_bounty_tables.sql
```

## Step 5: Configure Vercel Environment Variables

In your Vercel dashboard, add these environment variables:

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://postgres:PASSWORD@db.XXX.supabase.co:5432/postgres` | Supabase |
| `SESSION_SECRET` | Random 32+ character string | Generate yourself |
| `SMTP_HOST` | `smtp.gmail.com` | Your email |
| `SMTP_PORT` | `587` | Your email |
| `SMTP_USER` | `your-email@gmail.com` | Your email |
| `SMTP_PASS` | `your-app-password` | Your email |
| `SMTP_FROM` | `noreply@yourdomain.com` | Your choice |
| `GOOGLE_CLIENT_ID` | `your-google-client-id` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `your-google-secret` | Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://YOUR_VERCEL_DOMAIN/auth/google/callback` | Vercel |
| `SITE_URL` | `https://YOUR_VERCEL_DOMAIN` | Vercel |

## Step 6: Generate Session Secret

Run this to generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use: https://1password.com/password-generator/

## Step 7: Deploy to Vercel

1. Go to https://vercel.com/new
2. Import `iamfaz0/BONGO-CROWD`
3. Configure:
   - Framework: **Other**
   - Build Command: `npm install`
   - Output Directory: `.`
4. Add all environment variables from Step 5
5. Click **Deploy**

## Step 8: Update Google OAuth (if using)

After deployment:
1. Go to https://console.cloud.google.com
2. Edit your OAuth credentials
3. Add authorized redirect URI:
   - `https://YOUR_VERCEL_DOMAIN/auth/google/callback`
4. Save

## Troubleshooting

### Connection Issues
- Make sure you're using the **Connection string** not the **Project URL**
- Password must be URL-encoded if it has special characters
- Check if IP is allowed (Supabase allows all by default)

### SSL Issues
Supabase requires SSL. Your config/database.js should have:
```javascript
ssl: { rejectUnauthorized: false }
```

### Migration Errors
- Run migrations in order listed in Step 4
- If tables already exist, some migrations may fail - this is OK
- Check Supabase SQL Editor logs for errors

## Free Tier Limits

- **Database**: 500MB
- **Bandwidth**: 2GB/month
- **Requests**: 100,000/month
- **Auth users**: Unlimited

For BONGO-CROWD, this should handle 100-500 users easily.

## Need Help?

- Supabase Docs: https://supabase.com/docs
- Vercel Postgres Alternative: https://vercel.com/docs/storage/vercel-postgres

---

**Ready to start?** Go to https://supabase.com and create your project! 🚀
