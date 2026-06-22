# BONGO-CROWD Deployment Guide

## Prerequisites

- GitHub account
- Vercel account (free tier works)
- PostgreSQL database (Vercel Postgres, Supabase, or Neon recommended)
- SMTP email service (Gmail, SendGrid, or Mailgun)

## Environment Variables

Copy `.env.example` to `.env` and fill in these values:

```bash
# Database (Use Vercel Postgres, Supabase, or Neon)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Session Secret (Generate a strong random string)
SESSION_SECRET=your-super-secret-key-here

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com

# Site URL
SITE_URL=https://your-domain.com
```

## Deploy to Vercel

### Option 1: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Option 2: GitHub Integration

1. Push code to GitHub
2. Connect GitHub repo to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy

## Database Setup

For Vercel, use one of these PostgreSQL providers:

- **Vercel Postgres**: Built-in, easiest setup
- **Supabase**: Free tier, generous limits
- **Neon**: Serverless PostgreSQL

### Database Migration

Run migrations after deployment:

```bash
# Connect to your database and run:
psql $DATABASE_URL -f database/schema.sql
```

## Post-Deployment

1. Create admin user
2. Configure site settings
3. Add your first company
4. Create a bug bounty program

## Support

For issues, check:
- Vercel Logs (Dashboard > Deployments > Logs)
- Database connection
- Environment variables
