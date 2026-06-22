const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { timeAgo, formatCurrency } = require('../utils/site');

// Home page
router.get('/', async (req, res) => {
    try {
        // Get stats
        const statsResult = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM programs WHERE status = 'active') as active_programs,
                (SELECT COUNT(*) FROM users WHERE role = 'hacker') as hackers,
                (SELECT COUNT(*) FROM reports WHERE status = 'resolved') as resolved_reports,
                (SELECT COALESCE(SUM(bounty_amount), 0) FROM reports WHERE bounty_paid = true) as total_paid
        `);
        
        // Get featured programs
        const programsResult = await db.query(`
            SELECT p.*, c.name as company_name, c.logo_url as company_logo
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            WHERE p.status = 'active'
            ORDER BY p.created_at DESC
            LIMIT 6
        `);
        
        // Get top hackers
        const hackersResult = await db.query(`
            SELECT id, username, display_name, avatar_url, reputation, points, total_earnings
            FROM users
            WHERE role = 'hacker' AND is_active = true AND is_banned = false
            ORDER BY points DESC
            LIMIT 10
        `);
        
        // Get recent reports (for public disclosure)
        const reportsResult = await db.query(`
            SELECT r.report_id, r.disclosure_title, r.disclosed_at, 
                   u.username, u.avatar_url, p.name as program_name, r.severity
            FROM reports r
            JOIN users u ON r.researcher_id = u.id
            JOIN programs p ON r.program_id = p.id
            WHERE r.disclosure_allowed = true AND r.disclosed_at IS NOT NULL
            ORDER BY r.disclosed_at DESC
            LIMIT 5
        `);
        
        res.render('index', {
            title: 'BONGO-CROWD - Tanzania\'s Premier Bug Bounty Platform',
            stats: statsResult.rows[0],
            programs: programsResult.rows,
            hackers: hackersResult.rows,
            disclosures: reportsResult.rows,
            timeAgo,
            formatCurrency
        });
    } catch (err) {
        console.error(err);
        res.render('index', { title: 'BONGO-CROWD' });
    }
});

// Search page
router.get('/search', async (req, res) => {
    const { q, type = 'all' } = req.query;
    
    try {
        let results = { programs: [], hackers: [], reports: [] };
        
        if (q) {
            if (type === 'all' || type === 'programs') {
                const programsResult = await db.query(`
                    SELECT p.*, c.name as company_name, c.logo_url as company_logo
                    FROM programs p
                    JOIN companies c ON p.company_id = c.id
                    WHERE p.status = 'active' AND (
                        p.name ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1
                    )
                    LIMIT 20
                `, [`%${q}%`]);
                results.programs = programsResult.rows;
            }
            
            if (type === 'all' || type === 'hackers') {
                const hackersResult = await db.query(`
                    SELECT id, username, display_name, avatar_url, reputation, points, bio
                    FROM users
                    WHERE role = 'hacker' AND is_active = true AND is_banned = false
                    AND (username ILIKE $1 OR display_name ILIKE $1 OR bio ILIKE $1)
                    LIMIT 20
                `, [`%${q}%`]);
                results.hackers = hackersResult.rows;
            }
        }
        
        res.render('search', {
            title: q ? `Search: ${q}` : 'Search',
            query: q,
            type,
            results,
            formatCurrency
        });
    } catch (err) {
        console.error(err);
        res.render('search', { title: 'Search', query: q, type, results: { programs: [], hackers: [], reports: [] } });
    }
});

// Guidelines page
router.get('/guidelines', (req, res) => {
    res.render('guidelines', {
        title: 'Responsible Disclosure Guidelines'
    });
});

// About page
router.get('/about', (req, res) => {
    res.render('about', {
        title: 'About BONGO-CROWD'
    });
});

// Contact page
router.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Contact Us'
    });
});

// Maintenance page
router.get('/maintenance', (req, res) => {
    res.render('maintenance', {
        title: 'Maintenance Mode',
        message: 'We are currently performing scheduled maintenance. Please check back later.'
    });
});

const badgeService = require('../services/badgeService');

// Leaderboard page
router.get('/leaderboard', async (req, res) => {
    const { period = 'all', search = '', page = 1 } = req.query;
    const perPage = 25;
    const currentPage = parseInt(page) || 1;
    const offset = (currentPage - 1) * perPage;
    
    try {
        // Get leaderboard data from badgeService
        const allHackers = await badgeService.getLeaderboard(period, 1000, 0);
        
        // Filter by search
        let filteredHackers = allHackers;
        if (search) {
            filteredHackers = allHackers.filter(h => 
                h.username.toLowerCase().includes(search.toLowerCase()) ||
                (h.display_name && h.display_name.toLowerCase().includes(search.toLowerCase()))
            );
        }
        
        // Paginate
        const totalHackers = filteredHackers.length;
        const totalPages = Math.ceil(totalHackers / perPage);
        const paginatedHackers = filteredHackers.slice(offset, offset + perPage);
        
        // Get top 3 for podium
        const topHackers = allHackers.slice(0, 3);
        
        // Add rank labels
        const rankedHackers = paginatedHackers.map((h, i) => ({
            ...h,
            rank_label: h.rank,
            rank_display: h.rank.charAt(0).toUpperCase() + h.rank.slice(1)
        }));
        
        res.render('leaderboard', {
            title: 'Hacker Leaderboard',
            hackers: rankedHackers,
            topHackers: topHackers,
            period,
            search,
            page: currentPage,
            perPage,
            totalPages,
            totalHackers
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.render('leaderboard', {
            title: 'Hacker Leaderboard',
            hackers: [],
            topHackers: [],
            period: 'all',
            search: '',
            page: 1,
            perPage: 25,
            totalPages: 0,
            totalHackers: 0
        });
    }
});

// Dashboard route
const { ensureAuthenticated } = require('../middleware/auth');

router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        // Get user's stats
        const userStats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM reports WHERE researcher_id = $1) as total_reports,
                (SELECT COUNT(*) FROM reports WHERE researcher_id = $1 AND status IN ('triaged', 'resolved')) as valid_reports,
                (SELECT COALESCE(SUM(bounty_amount), 0) FROM reports WHERE researcher_id = $1 AND bounty_paid = true) as total_earned,
                (SELECT COUNT(*) FROM reports WHERE researcher_id = $1 AND status = 'new') as pending_reports
        `, [req.user.id]);
        
        // Get user's recent reports
        const recentReports = await db.query(`
            SELECT r.*, p.name as program_name, p.logo_url as program_logo
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE r.researcher_id = $1
            ORDER BY r.created_at DESC
            LIMIT 5
        `, [req.user.id]);
        
        // Get available programs
        const availablePrograms = await db.query(`
            SELECT p.*, c.name as company_name, c.logo_url as company_logo
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            WHERE p.status = 'active'
            ORDER BY p.created_at DESC
            LIMIT 6
        `);
        
        // Get notifications
        const notifications = await db.query(`
            SELECT * FROM notifications 
            WHERE user_id = $1 AND is_read = false
            ORDER BY created_at DESC
            LIMIT 5
        `, [req.user.id]);
        
        res.render('dashboard', {
            title: 'Dashboard',
            user: req.user,
            stats: userStats.rows[0],
            recentReports: recentReports.rows,
            availablePrograms: availablePrograms.rows,
            notifications: notifications.rows
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('dashboard', {
            title: 'Dashboard',
            user: req.user,
            stats: {},
            recentReports: [],
            availablePrograms: [],
            notifications: []
        });
    }
});

// ==================== COMPANY REGISTRATION PORTAL ====================

// Company registration page
router.get('/company/register', (req, res) => {
    res.render('company-register', {
        title: 'Register Your Company',
        errors: [],
        formData: {}
    });
});

// Company registration POST
router.post('/company/register', async (req, res) => {
    try {
        const { company_name, company_email, website, description, 
                contact_name, contact_email, contact_phone } = req.body;
        
        // Validation
        const errors = [];
        if (!company_name || company_name.length < 2) {
            errors.push('Company name must be at least 2 characters');
        }
        if (!company_email || !company_email.includes('@')) {
            errors.push('Valid company email is required');
        }
        if (!contact_name) {
            errors.push('Contact name is required');
        }
        if (!contact_email || !contact_email.includes('@')) {
            errors.push('Valid contact email is required');
        }
        
        if (errors.length > 0) {
            return res.render('company-register', {
                title: 'Register Your Company',
                errors: errors,
                formData: req.body
            });
        }
        
        // Check if email already exists
        const checkEmail = await db.query(
            'SELECT id FROM users WHERE email = $1 OR email = $2',
            [company_email.toLowerCase(), contact_email.toLowerCase()]
        );
        
        if (checkEmail.rows.length > 0) {
            return res.render('company-register', {
                title: 'Register Your Company',
                errors: ['Email already registered. Please use a different email or login.'],
                formData: req.body
            });
        }
        
        // Create company registration request (pending approval)
        const bcrypt = require('bcryptjs');
        const tempPassword = Math.random().toString(36).substring(2, 12);
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        
        // Create user first (will be activated upon approval)
        const userResult = await db.query(`
            INSERT INTO users (email, username, password_hash, display_name, role, is_active, is_verified)
            VALUES ($1, $2, $3, $4, 'company', false, false)
            RETURNING id
        `, [
            contact_email.toLowerCase(),
            company_name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
            passwordHash,
            contact_name
        ]);
        
        const userId = userResult.rows[0].id;
        
        // Create company (pending approval)
        await db.query(`
            INSERT INTO companies (name, description, website, email, owner_id, status, contact_name, contact_email, contact_phone)
            VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
        `, [
            company_name,
            description,
            website,
            company_email.toLowerCase(),
            userId,
            contact_name,
            contact_email.toLowerCase(),
            contact_phone
        ]);
        
        // Notify admins
        const admins = await db.query("SELECT id FROM users WHERE role = 'admin'");
        for (const admin of admins.rows) {
            await db.query(`
                INSERT INTO notifications (user_id, type, message, link, is_read, created_at)
                VALUES ($1, 'company_registration', $2, $3, false, CURRENT_TIMESTAMP)
            `, [
                admin.id,
                `New company registration: ${company_name}`,
                '/admin/companies/pending'
            ]);
        }
        
        res.render('company-register-success', {
            title: 'Registration Submitted',
            companyName: company_name
        });
        
    } catch (err) {
        console.error('Company registration error:', err);
        res.render('company-register', {
            title: 'Register Your Company',
            errors: ['An error occurred. Please try again.'],
            formData: req.body
        });
    }
});

module.exports = router;
