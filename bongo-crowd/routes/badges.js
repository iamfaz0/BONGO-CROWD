/**
 * Badge and Reputation Routes
 * Handles badge viewing, reputation display, and admin badge management
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const badgeService = require('../services/badgeService');
const { timeAgo, formatCurrency } = require('../utils/site');

// ============================================
// USER BADGES VIEW
// ============================================

// GET /users/badges - View all badges and user's badges
router.get('/users/badges', ensureAuthenticated, async (req, res) => {
    try {
        // Get all badges with user progress
        const badges = await badgeService.getAllBadgesWithProgress(req.user.id);
        
        // Get user reputation summary
        const reputation = await badgeService.getUserReputationSummary(req.user.id);
        
        // Group badges by category
        const badgesByCategory = {
            skill: badges.filter(b => b.category === 'skill'),
            achievement: badges.filter(b => b.category === 'achievement'),
            activity: badges.filter(b => b.category === 'activity'),
            special: badges.filter(b => b.category === 'special')
        };
        
        // Get recent badge earnings
        const recentBadges = await db.query(
            `SELECT b.*, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = $1
             ORDER BY ub.earned_at DESC
             LIMIT 5`,
            [req.user.id]
        );
        
        // Get reputation history
        const reputationHistory = await db.query(
            `SELECT * FROM reputation_history
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [req.user.id]
        );
        
        res.render('users/badges', {
            title: 'Badges & Reputation',
            badges,
            badgesByCategory,
            reputation,
            recentBadges: recentBadges.rows,
            reputationHistory: reputationHistory.rows,
            timeAgo,
            formatCurrency,
            user: req.user
        });
    } catch (err) {
        console.error('Error loading badges page:', err);
        req.flash('error', 'Failed to load badges page');
        res.redirect('/users/dashboard');
    }
});

// ============================================
// API ROUTES - USER REPUTATION
// ============================================

// GET /api/users/:id/reputation - Get user reputation data
router.get('/api/users/:id/reputation', async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Check if user exists
        const userResult = await db.query(
            'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1 AND is_active = true AND is_banned = false',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const user = userResult.rows[0];
        
        // Get reputation data
        const reputation = await badgeService.getUserReputationSummary(userId);
        
        // Get earned badges
        const badges = await badgeService.getUserBadges(userId);
        
        // Get recent activity
        const recentActivity = await db.query(
            `SELECT action_type, points_change, description, created_at
             FROM reputation_history
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        );
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url
                },
                reputation: {
                    score: reputation.score,
                    rank: reputation.rank,
                    next_rank: reputation.next_rank,
                    points_to_next_rank: reputation.points_to_next_rank,
                    progress_percent: reputation.rank_progress_percent,
                    valid_reports: reputation.valid_reports_count,
                    critical_findings: reputation.critical_findings,
                    high_findings: reputation.high_findings,
                    total_earnings: reputation.total_bounties_earned
                },
                badges: badges.map(b => ({
                    name: b.name,
                    description: b.description,
                    icon: b.icon,
                    category: b.category,
                    rarity: b.rarity,
                    earned_at: b.earned_at
                })),
                recent_activity: recentActivity.rows
            }
        });
    } catch (err) {
        console.error('Error fetching reputation:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reputation data'
        });
    }
});

// GET /api/users/me/reputation - Get current user's reputation
router.get('/api/users/me/reputation', ensureAuthenticated, async (req, res) => {
    req.params.id = req.user.id;
    return router.handle(req, res);
});

// ============================================
// ADMIN BADGE MANAGEMENT
// ============================================

// GET /admin/badges - List all badges (admin view)
router.get('/admin/badges', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const badgesResult = await db.query(
            `SELECT b.*, 
                (SELECT COUNT(*) FROM user_badges WHERE badge_id = b.id) as earned_count
             FROM badges b
             ORDER BY b.category, b.rarity, b.name`
        );
        
        res.render('admin/badges', {
            title: 'Manage Badges',
            badges: badgesResult.rows,
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (err) {
        console.error('Error loading badges:', err);
        req.flash('error', 'Failed to load badges');
        res.redirect('/admin/dashboard');
    }
});

// GET /admin/badges/create - Create badge form
router.get('/admin/badges/create', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.render('admin/badge-form', {
        title: 'Create Badge',
        badge: null,
        errors: []
    });
});

// POST /admin/badges/create - Create new badge
router.post('/admin/badges/create', ensureAuthenticated, ensureAdmin, [
    body('name').trim().notEmpty().withMessage('Badge name is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('category').isIn(['skill', 'achievement', 'activity', 'special']).withMessage('Invalid category'),
    body('rarity').isIn(['common', 'rare', 'epic', 'legendary']).withMessage('Invalid rarity'),
    body('criteria_type').trim().notEmpty().withMessage('Criteria type is required'),
    body('criteria_count').isInt({ min: 1 }).withMessage('Criteria count must be at least 1'),
    body('points_reward').isInt({ min: 0 }).withMessage('Points reward must be non-negative')
], async (req, res) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.render('admin/badge-form', {
            title: 'Create Badge',
            badge: req.body,
            errors: errors.array()
        });
    }
    
    const {
        name,
        description,
        icon,
        category,
        rarity,
        criteria_type,
        criteria_count,
        points_reward,
        color,
        gradient_start,
        gradient_end,
        is_active
    } = req.body;
    
    try {
        // Check if badge name exists
        const existing = await db.query(
            'SELECT id FROM badges WHERE name = $1',
            [name]
        );
        
        if (existing.rows.length > 0) {
            req.flash('error', 'A badge with this name already exists');
            return res.redirect('/admin/badges/create');
        }
        
        // Create badge
        const criteria = JSON.stringify({
            type: criteria_type,
            count: parseInt(criteria_count)
        });
        
        await db.query(
            `INSERT INTO badges 
             (name, description, icon, criteria, category, rarity, points_reward, color, gradient_start, gradient_end, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                name,
                description,
                icon || '🏆',
                criteria,
                category,
                rarity,
                parseInt(points_reward) || 0,
                color || '#7c3aed',
                gradient_start || '#7c3aed',
                gradient_end || '#06b6d4',
                is_active === 'on'
            ]
        );
        
        req.flash('success', `Badge "${name}" created successfully!`);
        res.redirect('/admin/badges');
    } catch (err) {
        console.error('Error creating badge:', err);
        req.flash('error', 'Failed to create badge');
        res.redirect('/admin/badges/create');
    }
});

// GET /admin/badges/:id/edit - Edit badge form
router.get('/admin/badges/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM badges WHERE id = $1',
            [req.params.id]
        );
        
        if (result.rows.length === 0) {
            req.flash('error', 'Badge not found');
            return res.redirect('/admin/badges');
        }
        
        const badge = result.rows[0];
        badge.criteria_type = badge.criteria?.type || '';
        badge.criteria_count = badge.criteria?.count || 1;
        
        res.render('admin/badge-form', {
            title: 'Edit Badge',
            badge,
            errors: []
        });
    } catch (err) {
        console.error('Error loading badge:', err);
        req.flash('error', 'Failed to load badge');
        res.redirect('/admin/badges');
    }
});

// POST /admin/badges/:id/edit - Update badge
router.post('/admin/badges/:id/edit', ensureAuthenticated, ensureAdmin, [
    body('name').trim().notEmpty().withMessage('Badge name is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('category').isIn(['skill', 'achievement', 'activity', 'special']).withMessage('Invalid category'),
    body('rarity').isIn(['common', 'rare', 'epic', 'legendary']).withMessage('Invalid rarity')
], async (req, res) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.render('admin/badge-form', {
            title: 'Edit Badge',
            badge: { ...req.body, id: req.params.id },
            errors: errors.array()
        });
    }
    
    const {
        name,
        description,
        icon,
        category,
        rarity,
        criteria_type,
        criteria_count,
        points_reward,
        color,
        gradient_start,
        gradient_end,
        is_active
    } = req.body;
    
    try {
        const criteria = JSON.stringify({
            type: criteria_type,
            count: parseInt(criteria_count)
        });
        
        await db.query(
            `UPDATE badges SET
                name = $1,
                description = $2,
                icon = $3,
                criteria = $4,
                category = $5,
                rarity = $6,
                points_reward = $7,
                color = $8,
                gradient_start = $9,
                gradient_end = $10,
                is_active = $11,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $12`,
            [
                name,
                description,
                icon || '🏆',
                criteria,
                category,
                rarity,
                parseInt(points_reward) || 0,
                color || '#7c3aed',
                gradient_start || '#7c3aed',
                gradient_end || '#06b6d4',
                is_active === 'on',
                req.params.id
            ]
        );
        
        req.flash('success', `Badge "${name}" updated successfully!`);
        res.redirect('/admin/badges');
    } catch (err) {
        console.error('Error updating badge:', err);
        req.flash('error', 'Failed to update badge');
        res.redirect(`/admin/badges/${req.params.id}/edit`);
    }
});

// POST /admin/badges/:id/delete - Delete badge
router.post('/admin/badges/:id/delete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Check if badge has been earned
        const earnedCount = await db.query(
            'SELECT COUNT(*) as count FROM user_badges WHERE badge_id = $1',
            [req.params.id]
        );
        
        if (parseInt(earnedCount.rows[0].count) > 0) {
            // Instead of deleting, mark as inactive
            await db.query(
                'UPDATE badges SET is_active = false WHERE id = $1',
                [req.params.id]
            );
            req.flash('success', 'Badge has been deactivated (users who earned it keep it)');
        } else {
            // Safe to delete
            await db.query(
                'DELETE FROM badges WHERE id = $1',
                [req.params.id]
            );
            req.flash('success', 'Badge deleted successfully');
        }
        
        res.redirect('/admin/badges');
    } catch (err) {
        console.error('Error deleting badge:', err);
        req.flash('error', 'Failed to delete badge');
        res.redirect('/admin/badges');
    }
});

// POST /admin/badges/:id/award - Award badge to user (admin action)
router.post('/admin/badges/:id/award', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { user_id } = req.body;
        const badgeId = req.params.id;
        
        if (!user_id) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const result = await badgeService.awardBadge(user_id, badgeId, req.user.id);
        
        if (result.success) {
            req.flash('success', `Badge awarded to user successfully!`);
        } else {
            req.flash('error', result.message);
        }
        
        res.redirect('/admin/badges');
    } catch (err) {
        console.error('Error awarding badge:', err);
        req.flash('error', 'Failed to award badge');
        res.redirect('/admin/badges');
    }
});

// GET /admin/users/:id/award-badge - Show award badge form
router.get('/admin/users/:id/award-badge', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get user
        const userResult = await db.query(
            'SELECT id, username, display_name FROM users WHERE id = $1',
            [req.params.id]
        );
        
        if (userResult.rows.length === 0) {
            req.flash('error', 'User not found');
            return res.redirect('/admin/users');
        }
        
        // Get available badges (ones user doesn't have)
        const badgesResult = await db.query(
            `SELECT * FROM badges 
             WHERE is_active = true
             AND id NOT IN (
                 SELECT badge_id FROM user_badges WHERE user_id = $1
             )
             ORDER BY category, rarity, name`,
            [req.params.id]
        );
        
        res.render('admin/award-badge', {
            title: 'Award Badge',
            user: userResult.rows[0],
            badges: badgesResult.rows
        });
    } catch (err) {
        console.error('Error loading award badge form:', err);
        req.flash('error', 'Failed to load award badge form');
        res.redirect('/admin/users');
    }
});

// ============================================
// API ROUTES FOR AJAX
// ============================================

// POST /api/badges/check - Trigger badge check (for testing)
router.post('/api/badges/check', ensureAuthenticated, async (req, res) => {
    try {
        const awardedBadges = await badgeService.checkAndAwardBadges(req.user.id);
        
        res.json({
            success: true,
            data: {
                badges_awarded: awardedBadges.length,
                badges: awardedBadges.map(b => ({
                    name: b.name,
                    icon: b.icon,
                    points: b.points_reward
                }))
            }
        });
    } catch (err) {
        console.error('Error checking badges:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to check badges'
        });
    }
});

module.exports = router;
