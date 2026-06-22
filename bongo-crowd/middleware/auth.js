// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error', 'Please log in to access this page');
    res.redirect('/auth/login');
};

const ensureGuest = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return next();
    }
    res.redirect('/users/dashboard');
};

const ensureAdmin = async (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/');
};

const ensureCompany = async (req, res, next) => {
    if (req.isAuthenticated() && (req.user.role === 'company' || req.user.role === 'admin')) {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/');
};

const ensureHacker = async (req, res, next) => {
    if (req.isAuthenticated() && (req.user.role === 'hacker' || req.user.role === 'admin')) {
        return next();
    }
    req.flash('error', 'Hacker access required');
    res.redirect('/');
};

// Wrapper functions for compatibility with requireAuth style
const requireAuth = ensureAuthenticated;
const requireAdmin = ensureAdmin;
const requireCompany = ensureCompany;
const requireHacker = ensureHacker;

module.exports = {
    ensureAuthenticated,
    ensureGuest,
    ensureAdmin,
    requireAdmin,
    ensureCompany,
    requireCompany,
    requireAuth,
    ensureHacker,
    requireHacker
};
