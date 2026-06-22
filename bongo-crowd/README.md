# 🐛 BONGO-CROWD

**Tanzania's Premier Bug Bounty Platform**

A full-featured bug bounty platform built with Node.js, Express, and PostgreSQL. Similar to HackerOne and Bugcrowd, designed specifically for the Tanzanian market with support for M-Pesa payments and local companies.

## ✨ Features

### User Features
- 🔐 **Authentication**: Email/password and Google OAuth login
- 👤 **User Profiles**: Customizable profiles with avatars, bio, social links
- 🔍 **Programs**: Browse and filter active bug bounty programs
- 📝 **Report Submission**: Submit vulnerability reports with file attachments
- 📊 **Dashboard**: Track reports, earnings, and statistics
- 🏆 **Leaderboard**: Compete with other researchers
- 🔔 **Notifications**: Real-time updates on report status
- 🔒 **Safe Harbor**: Legal protection for responsible disclosure

### Admin Features
- 🛠️ **Site Settings**: Configure site name, maintenance mode, registration
- 👥 **User Management**: View, ban/unban users
- 🏢 **Company Management**: Add and manage companies
- 📋 **Program Management**: Create and manage bug bounty programs
- 📈 **Reports Management**: Review, triage, and process vulnerability reports
- 💰 **Bounty Management**: Set reward amounts and mark as paid

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/bongo-crowd.git
cd bongo-crowd
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up the database**
```bash
# Create database
createdb bongocrowd

# Run migrations
npm run migrate

# Seed sample data (optional)
npm run seed
```

5. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

Visit `http://localhost:3000`

### Default Admin Account
After seeding, you can log in with:
- **Email**: `admin@bongo-crowd.com`
- **Password**: `admin123`

**IMPORTANT**: Change this immediately in production!

## 🏗️ Architecture

```
bongo-crowd/
├── config/           # Configuration files
│   ├── database.js   # PostgreSQL connection
│   └── passport.js   # Authentication strategies
├── database/         # Database schema
│   └── schema.sql    # Full database schema
├── middleware/       # Express middleware
│   ├── auth.js       # Authentication guards
│   └── site.js       # Site settings middleware
├── public/           # Static assets
│   ├── css/
│   ├── js/
│   └── images/
├── routes/           # Route handlers
│   ├── index.js      # Home, search, guidelines
│   ├── auth.js       # Login, register, OAuth
│   ├── programs.js   # Program listings
│   ├── reports.js    # Report submission/management
│   ├── users.js      # User profiles, dashboard
│   ├── admin.js      # Admin panel
│   └── api.js        # API endpoints
├── utils/            # Utility functions
│   └── site.js       # Site helpers
├── views/            # EJS templates
│   ├── layout.ejs    # Main layout
│   ├── index.ejs     # Homepage
│   ├── auth/         # Authentication pages
│   ├── users/        # User pages
│   ├── admin/        # Admin pages
│   └── programs/     # Program pages
└── server.js         # Application entry point
```

## 🗄️ Database Schema

### Core Tables
- **users** - User accounts (hackers, companies, admins)
- **companies** - Company profiles
- **programs** - Bug bounty programs
- **reports** - Vulnerability reports
- **site_settings** - Site configuration

See `database/schema.sql` for complete schema.

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `PORT` | Server port | 3000 |
| `SESSION_SECRET` | Session encryption key | - |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | - |
| `SMTP_HOST` | Email server host | - |
| `SMTP_USER` | Email username | - |
| `SMTP_PASS` | Email password | - |

### Site Settings

Configure via Admin Panel:
- **Maintenance Mode**: Put site under maintenance
- **Allow Signups**: Enable/disable new registrations
- **Email Verification**: Require email verification
- **Min Bounty**: Minimum bounty amount
- **Social Links**: Twitter, LinkedIn, Telegram

## 🔒 Security

- ✅ Password hashing with bcrypt
- ✅ Session-based authentication
- ✅ CSRF protection
- ✅ Rate limiting
- ✅ Input validation
- ✅ SQL injection protection (parameterized queries)
- ✅ XSS protection (Helmet, auto-escaping)
- ✅ Safe Harbor policy for researchers

## 🎨 Customization

### Branding
Edit site settings in the admin panel:
- Site name
- Logo
- Description
- Contact information
- Social media links

### Styling
Modify CSS in `public/css/style.css`

### Email Templates
Located in `views/emails/`

## 📱 Payment Methods

Currently supported:
- 💳 **M-Pesa** (Tanzania)
- 🏦 **Bank Transfer**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

- Inspired by HackerOne and Bugcrowd
- Built for the Tanzanian security community
- Open source for transparency and community contribution

## 📞 Support

- 📧 Email: support@bongo-crowd.com
- 🐦 Twitter: @BongoCrowd
- 💬 Telegram: t.me/bongocrowd

---

**Made with ❤️ in Tanzania** 🇹🇿
