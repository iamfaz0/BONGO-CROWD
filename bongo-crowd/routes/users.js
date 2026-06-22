const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');
const { formatCurrency, timeAgo } = require('../utils/site');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Configure multer for avatar uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files (jpg, png, gif) are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB limit
    },
    fileFilter: fileFilter
});

// Dashboard
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        let stats = {};
        let recentActivity = [];
        
        if (req.user.role === 'hacker') {
            // Hacker stats
            const statsResult = await db.query(`
                SELECT 
                    COUNT(*) as total_reports,
                    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
                    COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
                    SUM(bounty_amount) as total_earnings
                FROM reports 
                WHERE researcher_id = $1
            `, [req.user.id]);
            
            stats = statsResult.rows[0];
            
            // Recent reports
            const reportsResult = await db.query(`
                SELECT r.*, p.name as program_name, p.slug as program_slug
                FROM reports r
                JOIN programs p ON r.program_id = p.id
                WHERE r.researcher_id = $1
                ORDER BY r.created_at DESC
                LIMIT 5
            `, [req.user.id]);
            
            recentActivity = reportsResult.rows;
        } else if (req.user.role === 'company') {
            // Company stats
            const statsResult = await db.query(`
                SELECT 
                    COUNT(*) as total_reports,
                    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
                    SUM(bounty_amount) as total_paid
                FROM reports r
                JOIN programs p ON r.program_id = p.id
                JOIN companies c ON p.company_id = c.id
                WHERE c.admin_id = $1
            `, [req.user.id]);
            
            stats = statsResult.rows[0];
        }
        
        // Get notifications
        const notificationsResult = await db.query(`
            SELECT * FROM notifications
            WHERE user_id = $1 AND is_read = false
            ORDER BY created_at DESC
            LIMIT 5
        `, [req.user.id]);
        
        res.render('users/dashboard', {
            title: 'Dashboard',
            stats,
            recentActivity,
            notifications: notificationsResult.rows,
            timeAgo,
            formatCurrency
        });
    } catch (err) {
        console.error(err);
        res.render('users/dashboard', {
            title: 'Dashboard',
            stats: {},
            recentActivity: [],
            notifications: []
        });
    }
});

// Profile view
router.get('/profile/:username', async (req, res) => {
    try {
        const userResult = await db.query(`
            SELECT id, username, display_name, avatar_url, bio, location, 
                   website, twitter, github, reputation, reputation_score, points, total_earnings,
                   created_at, role
            FROM users
            WHERE username = $1 AND is_active = true AND is_banned = false
        `, [req.params.username.toLowerCase()]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'User Not Found',
                message: 'This user does not exist.'
            });
        }
        
        const user = userResult.rows[0];
        
        // Get public reports (disclosed)
        const reportsResult = await db.query(`
            SELECT r.report_id, r.disclosure_title, r.severity, r.disclosed_at,
                   p.name as program_name, p.slug as program_slug
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE r.researcher_id = $1 AND r.disclosure_allowed = true AND r.disclosed_at IS NOT NULL
            ORDER BY r.disclosed_at DESC
        `, [user.id]);
        
        // Get badges with full details
        const badgesResult = await db.query(`
            SELECT b.name, b.description, b.icon, b.icon_url, b.rarity, 
                   b.gradient_start, b.gradient_end, ub.earned_at as awarded_at
            FROM user_badges ub
            JOIN badges b ON ub.badge_id = b.id
            WHERE ub.user_id = $1
            ORDER BY ub.earned_at DESC
        `, [user.id]);
        
        // Get reputation info
        const reputationResult = await db.query(`
            SELECT rank, valid_reports_count
            FROM user_reputation
            WHERE user_id = $1
        `, [user.id]);
        
        const reputation = reputationResult.rows[0] || { rank: 'novice', valid_reports_count: 0 };
        
        // Calculate rank progress
        const RANK_THRESHOLDS = {
            novice: 0,
            hunter: 500,
            expert: 2000,
            elite: 5000,
            legend: 10000
        };
        
        const rankKeys = Object.keys(RANK_THRESHOLDS);
        const currentRankIndex = rankKeys.indexOf(reputation.rank);
        const nextRank = currentRankIndex < rankKeys.length - 1 ? rankKeys[currentRankIndex + 1] : null;
        const currentThreshold = RANK_THRESHOLDS[reputation.rank];
        const nextThreshold = nextRank ? RANK_THRESHOLDS[nextRank] : null;
        const pointsNeeded = nextThreshold ? nextThreshold - (user.reputation || 0) : 0;
        const progressPercent = nextThreshold 
            ? Math.min(100, ((user.reputation || 0) - currentThreshold) / (nextThreshold - currentThreshold) * 100)
            : 100;
        
        res.render('users/profile', {
            title: user.display_name || user.username,
            profile: user,
            reports: reportsResult.rows,
            badges: badgesResult.rows,
            rank: reputation.rank,
            validReportsCount: reputation.valid_reports_count,
            rankProgress: nextRank ? {
                current: reputation.rank,
                next: nextRank,
                percent: progressPercent,
                pointsNeeded: pointsNeeded,
                nextThreshold: nextThreshold
            } : null,
            isOwnProfile: req.user && req.user.id === user.id,
            timeAgo,
            formatCurrency
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Settings page
router.get('/settings', ensureAuthenticated, (req, res) => {
    res.render('users/settings', {
        title: 'Account Settings',
        errors: [],
        activeTab: req.query.tab || 'profile'
    });
});

// Update profile
router.post('/settings/profile', ensureAuthenticated, [
    body('display_name').trim().notEmpty().withMessage('Display name is required'),
    body('bio').trim().isLength({ max: 500 }).withMessage('Bio must be under 500 characters'),
    body('location').trim().isLength({ max: 100 }),
    body('website').trim().isURL().optional({ nullable: true }),
], async (req, res) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.render('users/settings', {
            title: 'Account Settings',
            errors: errors.array(),
            activeTab: 'profile'
        });
    }
    
    const { display_name, bio, location, website, twitter, github } = req.body;
    
    try {
        await db.query(`
            UPDATE users 
            SET display_name = $1, bio = $2, location = $3, website = $4, 
                twitter = $5, github = $6, updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
        `, [display_name, bio, location, website, twitter, github, req.user.id]);
        
        req.flash('success', 'Profile updated successfully');
        res.redirect('/users/settings?tab=profile');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update profile');
        res.redirect('/users/settings?tab=profile');
    }
});

// Upload avatar
router.post('/settings/avatar', ensureAuthenticated, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please select an image file');
            return res.redirect('/users/settings?tab=profile');
        }

        // Get current user to delete old avatar if exists
        const userResult = await db.query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
        const oldAvatar = userResult.rows[0]?.avatar_url;

        // Resize image to 200x200 using sharp
        const filename = `avatar-${req.user.id}-${Date.now()}.png`;
        const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars');
        const filepath = path.join(uploadPath, filename);

        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        // Process and resize image
        await sharp(req.file.buffer)
            .resize(200, 200, {
                fit: 'cover',
                position: 'center'
            })
            .png({ quality: 90 })
            .toFile(filepath);

        // Delete old avatar file if exists
        if (oldAvatar && oldAvatar.includes('/uploads/avatars/')) {
            const oldFilename = path.basename(oldAvatar);
            const oldFilepath = path.join(uploadPath, oldFilename);
            if (fs.existsSync(oldFilepath)) {
                fs.unlinkSync(oldFilepath);
            }
        }

        // Update user record with new avatar URL
        const avatarUrl = `/uploads/avatars/${filename}`;
        await db.query('UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [avatarUrl, req.user.id]);

        req.flash('success', 'Avatar updated successfully');
        res.redirect('/users/settings?tab=profile');
    } catch (err) {
        console.error('Avatar upload error:', err);
        req.flash('error', err.message || 'Failed to upload avatar');
        res.redirect('/users/settings?tab=profile');
    }
});

// Remove avatar
router.post('/settings/avatar/remove', ensureAuthenticated, async (req, res) => {
    try {
        // Get current avatar
        const userResult = await db.query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
        const oldAvatar = userResult.rows[0]?.avatar_url;

        // Delete old avatar file if exists
        if (oldAvatar && oldAvatar.includes('/uploads/avatars/')) {
            const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars');
            const oldFilename = path.basename(oldAvatar);
            const oldFilepath = path.join(uploadPath, oldFilename);
            if (fs.existsSync(oldFilepath)) {
                fs.unlinkSync(oldFilepath);
            }
        }

        // Update user record to remove avatar
        await db.query('UPDATE users SET avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);

        req.flash('success', 'Avatar removed successfully');
        res.redirect('/users/settings?tab=profile');
    } catch (err) {
        console.error('Avatar removal error:', err);
        req.flash('error', 'Failed to remove avatar');
        res.redirect('/users/settings?tab=profile');
    }
});

// Change password
router.post('/settings/password', ensureAuthenticated, async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    
    if (new_password !== confirm_password) {
        req.flash('error', 'New passwords do not match');
        return res.redirect('/users/settings?tab=security');
    }
    
    if (new_password.length < 8) {
        req.flash('error', 'Password must be at least 8 characters');
        return res.redirect('/users/settings?tab=security');
    }
    
    try {
        const bcrypt = require('bcryptjs');
        
        // Verify current password
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!userResult.rows[0].password_hash) {
            req.flash('error', 'Cannot change password for OAuth accounts');
            return res.redirect('/users/settings?tab=security');
        }
        
        const isMatch = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
        if (!isMatch) {
            req.flash('error', 'Current password is incorrect');
            return res.redirect('/users/settings?tab=security');
        }
        
        // Hash and update new password
        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, req.user.id]);
        
        req.flash('success', 'Password updated successfully');
        res.redirect('/users/settings?tab=security');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update password');
        res.redirect('/users/settings?tab=security');
    }
});

// Notifications
router.get('/notifications', ensureAuthenticated, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 50
        `, [req.user.id]);
        
        // Mark as read
        await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
        
        res.render('users/notifications', {
            title: 'Notifications',
            notifications: result.rows,
            timeAgo
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
});

module.exports = router;
