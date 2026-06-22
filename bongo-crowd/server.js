const express = require('express');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - minimal for HTTP
app.disable('x-powered-by');

// Security headers - HTTP compatible (no CSP blocking)
app.use(helmet({
    contentSecurityPolicy: false,  // Disabled - CSP was blocking styles
    hsts: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Rate limiting - auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    skipSuccessfulRequests: true,
    message: 'Too many login attempts, please try again later'
});
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);

// General rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));

// Session configuration
if (!process.env.SESSION_SECRET) {
    console.error('❌ SESSION_SECRET environment variable is required');
    process.exit(1);
}

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to false for HTTP
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Flash messages
app.use(flash());

// Passport configuration
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Global middleware - check maintenance mode
const { checkMaintenance } = require('./middleware/site');
app.use(checkMaintenance);

// CSRF Protection - DISABLED FOR NOW (causing login issues)
// const csrf = require('csurf');
// const csrfProtection = csrf({ cookie: true });

// Add CSRF token to all views (empty for now)
app.use((req, res, next) => {
    res.locals.csrfToken = '';
    next();
});

// Global variables middleware
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.site = req.app.locals.site || { site_name: 'BONGO-CROWD' };
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.info = req.flash('info');
    next();
});

// Routes - CSRF disabled for now
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/programs', require('./routes/programs'));
app.use('/reports', require('./routes/reports'));
app.use('/users', require('./routes/users'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));
app.use('/tools', require('./routes/tools'));
app.use('/', require('./routes/analytics')); // Analytics routes
app.use('/companies', require('./routes/analytics')); // Company analytics
app.use('/', require('./routes/badges')); // Badge and reputation routes

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        title: 'Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.'
    });
});

// Load site settings before starting server
const { loadSiteSettings } = require('./utils/site');

async function startServer() {
    await loadSiteSettings(app);
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 BONGO-CROWD server running on port ${PORT}`);
        console.log(`🌐 Visit: http://localhost:${PORT}`);
        console.log(`🔗 External: http://0.0.0.0:${PORT}`);
    });
}

startServer().catch(console.error);

module.exports = app;
