const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const db = require('../config/database');
const { ensureGuest } = require('../middleware/auth');
const { sendPasswordReset } = require('../config/email');

// Login page
router.get('/login', ensureGuest, (req, res) => {
    res.render('auth/login', { 
        title: 'Sign In',
        error: req.flash('error')
    });
});

// Login POST
router.post('/login', passport.authenticate('local', {
    successRedirect: '/users/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: true
}));

// Register page
router.get('/register', ensureGuest, (req, res) => {
    res.render('auth/register', { 
        title: 'Sign Up',
        errors: [],
        formData: {}
    });
});

// Register POST
router.post('/register', [
    ensureGuest,
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('display_name').trim().notEmpty().withMessage('Display name is required')
], async (req, res) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.render('auth/register', {
            title: 'Sign Up',
            errors: errors.array(),
            formData: req.body
        });
    }
    
    const { username, email, password, display_name } = req.body;
    
    try {
        // Check if email exists
        const emailCheck = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (emailCheck.rows.length > 0) {
            return res.render('auth/register', {
                title: 'Sign Up',
                errors: [{ msg: 'Email already registered' }],
                formData: req.body
            });
        }
        
        // Check if username exists
        const usernameCheck = await db.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
        if (usernameCheck.rows.length > 0) {
            return res.render('auth/register', {
                title: 'Sign Up',
                errors: [{ msg: 'Username already taken' }],
                formData: req.body
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const result = await db.query(
            `INSERT INTO users (email, username, password_hash, display_name, role) 
             VALUES ($1, $2, $3, $4, 'hacker') 
             RETURNING id`,
            [email.toLowerCase(), username.toLowerCase(), hashedPassword, display_name]
        );
        
        // Generate verification token
        const token = crypto.randomBytes(32).toString('hex');
        await db.query(
            `INSERT INTO email_verifications (user_id, token, expires_at) 
             VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
            [result.rows[0].id, token]
        );
        
        // In production, send email with verification link
        req.flash('success', 'Account created! Please check your email to verify your account.');
        res.redirect('/auth/login');
        
    } catch (err) {
        console.error(err);
        res.render('auth/register', {
            title: 'Sign Up',
            errors: [{ msg: 'An error occurred. Please try again.' }],
            formData: req.body
        });
    }
});

// Google OAuth
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

router.get('/google/callback', passport.authenticate('google', {
    successRedirect: '/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: true
}));

// Verify email
router.get('/verify/:token', async (req, res) => {
    try {
        const result = await db.query(
            `UPDATE users SET is_verified = true, is_active = true
             WHERE id = (SELECT user_id FROM email_verifications 
                        WHERE token = $1 AND expires_at > NOW() AND used = false)
             RETURNING id`,
            [req.params.token]
        );
        
        if (result.rows.length === 0) {
            req.flash('error', 'Invalid or expired verification token');
            return res.redirect('/auth/login');
        }
        
        // Mark token as used
        await db.query('UPDATE email_verifications SET used = true WHERE token = $1', [req.params.token]);
        
        req.flash('success', 'Email verified! You can now log in.');
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred');
        res.redirect('/auth/login');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.logout(() => {
        req.flash('success', 'You have been logged out');
        res.redirect('/');
    });
});

// Forgot password page
router.get('/forgot', ensureGuest, (req, res) => {
    res.render('auth/forgot', { title: 'Forgot Password' });
});

// Forgot password POST
router.post('/forgot', async (req, res) => {
    const { email } = req.body;
    
    try {
        const user = await db.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);
        
        if (user.rows.length > 0) {
            const token = crypto.randomBytes(32).toString('hex');
            await db.query(
                `INSERT INTO password_resets (user_id, token, expires_at) 
                 VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
                [user.rows[0].id, token]
            );
            
            // Send password reset email (don't block if it fails)
            try {
                await sendPasswordReset(user.rows[0].email, token);
            } catch (emailErr) {
                console.error('Failed to send email:', emailErr.message);
            }
        }
        
        req.flash('success', 'If an account exists with this email, you will receive password reset instructions.');
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred');
        res.redirect('/auth/forgot');
    }
});

// Reset password page (GET)
router.get('/reset-password/:token', ensureGuest, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW() AND used = false',
            [req.params.token]
        );
        
        if (result.rows.length === 0) {
            req.flash('error', 'Invalid or expired reset token');
            return res.redirect('/auth/forgot');
        }
        
        res.render('auth/reset-password', {
            title: 'Reset Password',
            token: req.params.token,
            errors: []
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred');
        res.redirect('/auth/forgot');
    }
});

// Reset password POST
router.post('/reset-password/:token', [
    ensureGuest,
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    })
], async (req, res) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.render('auth/reset-password', {
            title: 'Reset Password',
            token: req.params.token,
            errors: errors.array()
        });
    }
    
    try {
        const { password } = req.body;
        
        // Get reset token
        const resetResult = await db.query(
            'SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW() AND used = false',
            [req.params.token]
        );
        
        if (resetResult.rows.length === 0) {
            req.flash('error', 'Invalid or expired reset token');
            return res.redirect('/auth/forgot');
        }
        
        const reset = resetResult.rows[0];
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update user password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [hashedPassword, reset.user_id]
        );
        
        // Mark token as used
        await db.query(
            'UPDATE password_resets SET used = true WHERE id = $1',
            [reset.id]
        );
        
        req.flash('success', 'Password reset successfully! You can now log in.');
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred');
        res.redirect('/auth/forgot');
    }
});

module.exports = router;
