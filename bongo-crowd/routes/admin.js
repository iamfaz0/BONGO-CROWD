const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const { refreshSiteSettings } = require('../utils/site');
const { sendCompanyApprovalEmail, notifyUsersAboutNewProgram } = require('../config/email');

// Admin login
router.get('/login', (req, res) => {
    if (req.user && req.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { title: 'Admin Login' });
});

// Admin dashboard
router.get('/dashboard', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get stats
        const statsResult = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'hacker') as total_hackers,
                (SELECT COUNT(*) FROM companies) as total_companies,
                (SELECT COUNT(*) FROM programs WHERE status = 'active') as active_programs,
                (SELECT COUNT(*) FROM reports) as total_reports,
                (SELECT COUNT(*) FROM reports WHERE status = 'submitted') as pending_reports,
                (SELECT COALESCE(SUM(bounty_amount), 0) FROM reports WHERE bounty_paid = true) as total_paid
        `);
        
        // Get recent users
        const usersResult = await db.query(`
            SELECT id, username, email, role, created_at, is_active
            FROM users
            ORDER BY created_at DESC
            LIMIT 10
        `);
        
        // Get recent reports
        const reportsResult = await db.query(`
            SELECT r.report_id, r.title, r.status, r.created_at,
                   u.username as researcher, p.name as program
            FROM reports r
            JOIN users u ON r.researcher_id = u.id
            JOIN programs p ON r.program_id = p.id
            ORDER BY r.created_at DESC
            LIMIT 10
        `);
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats: statsResult.rows[0],
            users: usersResult.rows,
            reports: reportsResult.rows
        });
    } catch (err) {
        console.error(err);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats: {},
            users: [],
            reports: []
        });
    }
});

// Site Settings
router.get('/settings', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM site_settings LIMIT 1');
        res.render('admin/settings', {
            title: 'Site Settings',
            settings: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.render('admin/settings', { title: 'Site Settings', settings: {} });
    }
});

router.post('/settings', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const {
        site_name, site_description, footer_text, maintenance_mode, maintenance_message,
        allow_signups, require_email_verification, contact_email, support_email,
        social_twitter, social_linkedin, social_telegram, min_bounty_amount
    } = req.body;
    
    try {
        await db.query(`
            UPDATE site_settings SET
                site_name = $1,
                site_description = $2,
                footer_text = $3,
                maintenance_mode = $4,
                maintenance_message = $5,
                allow_signups = $6,
                require_email_verification = $7,
                contact_email = $8,
                support_email = $9,
                social_twitter = $10,
                social_linkedin = $11,
                social_telegram = $12,
                min_bounty_amount = $13,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [
            site_name, site_description, footer_text,
            maintenance_mode === 'on', maintenance_message, allow_signups === 'on', 
            require_email_verification === 'on', contact_email, support_email, 
            social_twitter, social_linkedin, social_telegram, min_bounty_amount
        ]);
        
        // Refresh app locals
        await refreshSiteSettings(req.app);
        
        req.flash('success', 'Settings updated successfully');
        res.redirect('/admin/settings');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update settings');
        res.redirect('/admin/settings');
    }
});

// Users management
router.get('/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { role = 'all', search = '' } = req.query;
        
        let query = 'SELECT * FROM users WHERE 1=1';
        const params = [];
        
        if (role !== 'all') {
            query += ` AND role = $${params.length + 1}`;
            params.push(role);
        }
        
        if (search) {
            query += ` AND (username ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1} OR display_name ILIKE $${params.length + 1})`;
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await db.query(query, params);
        
        res.render('admin/users', {
            title: 'Manage Users',
            users: result.rows,
            filters: { role, search }
        });
    } catch (err) {
        console.error(err);
        res.render('admin/users', { title: 'Manage Users', users: [], filters: { role: 'all', search: '' } });
    }
});

// Toggle user ban
router.post('/users/:id/ban', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { banned } = req.body;
        await db.query('UPDATE users SET is_banned = $1 WHERE id = $2', [banned === 'true', req.params.id]);
        req.flash('success', `User ${banned === 'true' ? 'banned' : 'unbanned'} successfully`);
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update user');
        res.redirect('/admin/users');
    }
});

// Companies management
router.get('/companies', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.*, u.email as admin_email, u.username as admin_username,
                   (SELECT COUNT(*) FROM programs WHERE company_id = c.id) as program_count
            FROM companies c
            LEFT JOIN users u ON c.admin_id = u.id
            ORDER BY c.created_at DESC
        `);
        
        res.render('admin/companies', {
            title: 'Manage Companies',
            companies: result.rows
        });
    } catch (err) {
        console.error(err);
        res.render('admin/companies', { title: 'Manage Companies', companies: [] });
    }
});

// Create company
router.post('/companies', ensureAuthenticated, ensureAdmin, [
    body('name').trim().notEmpty(),
    body('email').isEmail(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', 'Please fill all required fields');
        return res.redirect('/admin/companies');
    }
    
    const { name, description, website, email, password } = req.body;
    
    try {
        // Create admin user for company
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = name.toLowerCase().replace(/\s+/g, '_') + '_admin';
        
        const userResult = await db.query(
            `INSERT INTO users (email, username, password_hash, display_name, role, is_verified, is_active)
             VALUES ($1, $2, $3, $4, 'company', true, true) RETURNING id`,
            [email.toLowerCase(), username, hashedPassword, `${name} Admin`]
        );
        
        // Create company
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        await db.query(
            `INSERT INTO companies (name, slug, description, website, admin_id, is_verified)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [name, slug, description, website, userResult.rows[0].id]
        );
        
        req.flash('success', 'Company created successfully');
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create company');
        res.redirect('/admin/companies');
    }
});

// Programs management
router.get('/programs', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, c.name as company_name
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            ORDER BY p.created_at DESC
        `);
        
        res.render('admin/programs', {
            title: 'Manage Programs',
            programs: result.rows
        });
    } catch (err) {
        console.error(err);
        res.render('admin/programs', { title: 'Manage Programs', programs: [] });
    }
});

// Update program status
router.post('/programs/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await db.query('UPDATE programs SET status = $1 WHERE id = $2', [status, req.params.id]);
        req.flash('success', 'Program status updated');
        res.redirect('/admin/programs');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update program');
        res.redirect('/admin/programs');
    }
});

// Reports management
router.get('/reports', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status = 'all', severity = 'all', date_range = '' } = req.query;
        
        let query = `
            SELECT r.*, p.name as program_name, u.username as researcher_username
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            JOIN users u ON r.researcher_id = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (status !== 'all') {
            query += ` AND r.status = $${params.length + 1}`;
            params.push(status);
        }
        
        if (severity !== 'all') {
            query += ` AND r.severity = $${params.length + 1}`;
            params.push(severity);
        }
        
        // Date range filter
        if (date_range) {
            const now = new Date();
            let dateFrom;
            
            switch(date_range) {
                case '24h':
                    dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
            }
            
            if (dateFrom) {
                query += ` AND r.created_at >= $${params.length + 1}`;
                params.push(dateFrom);
            }
        }
        
        query += ' ORDER BY r.created_at DESC';
        
        const result = await db.query(query, params);
        
        res.render('admin/reports', {
            title: 'Manage Reports',
            reports: result.rows,
            filters: { status, severity, date_range }
        });
    } catch (err) {
        console.error(err);
        res.render('admin/reports', { title: 'Manage Reports', reports: [], filters: { status: 'all', severity: 'all', date_range: '' } });
    }
});

// Update report status and bounty
router.post('/reports/:id/update', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status, severity, bounty_amount } = req.body;
        
        await db.query(`
            UPDATE reports 
            SET status = $1, severity = $2, bounty_amount = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [status, severity, bounty_amount || null, req.params.id]);
        
        // Update researcher stats if bounty paid
        if (status === 'resolved' && bounty_amount) {
            const reportResult = await db.query(
                'SELECT researcher_id FROM reports WHERE id = $1',
                [req.params.id]
            );
            if (reportResult.rows.length > 0) {
                await db.query(
                    'UPDATE users SET total_earnings = total_earnings + $1, points = points + $2 WHERE id = $3',
                    [bounty_amount, calculatePoints(severity), reportResult.rows[0].researcher_id]
                );
            }
        }
        
        req.flash('success', 'Report updated successfully');
        res.redirect('/admin/reports');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update report');
        res.redirect('/admin/reports');
    }
});

function calculatePoints(severity) {
    const points = { critical: 500, high: 250, medium: 100, low: 25, info: 10 };
    return points[severity] || 10;
}

// User ban/unban
router.post('/users/:id/toggle-ban', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { banned } = req.body;
        await db.query(
            'UPDATE users SET is_banned = $1 WHERE id = $2',
            [banned === 'true', req.params.id]
        );
        req.flash('success', banned === 'true' ? 'User banned' : 'User unbanned');
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update user');
        res.redirect('/admin/users');
    }
});

// User update - role and status
router.post('/users/:id/update', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { display_name, email, role, is_active } = req.body;
        
        await db.query(`
            UPDATE users 
            SET display_name = $1, email = $2, role = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [
            display_name || null,
            email.toLowerCase(),
            role,
            is_active === 'true',
            req.params.id
        ]);
        
        req.flash('success', 'User updated successfully');
        res.redirect('/admin/users');
    } catch (err) {
        console.error('User update error:', err);
        req.flash('error', 'Failed to update user: ' + (err.message || 'Database error'));
        res.redirect('/admin/users');
    }
});

// ==================== COMPANIES MANAGEMENT ====================

// Companies list
router.get('/companies', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.*, 
                (SELECT COUNT(*) FROM programs WHERE company_id = c.id) as program_count
            FROM companies c
            ORDER BY c.created_at DESC
        `);
        
        res.render('admin/companies', {
            title: 'Manage Companies',
            companies: result.rows
        });
    } catch (err) {
        console.error(err);
        res.render('admin/companies', { title: 'Manage Companies', companies: [] });
    }
});

// Create company page
router.get('/companies/new', ensureAuthenticated, ensureAdmin, async (req, res) => {
    res.render('admin/company-form', {
        title: 'Create Company',
        company: null,
        errors: []
    });
});

// Create company POST
router.post('/companies/new', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { name, description, website, email, logo_url } = req.body;
        
        if (!name || !email) {
            req.flash('error', 'Company name and email are required');
            return res.redirect('/admin/companies/new');
        }
        
        // Check if company exists
        const check = await db.query('SELECT id FROM companies WHERE email = $1 OR name = $2', [email, name]);
        if (check.rows.length > 0) {
            req.flash('error', 'Company with this name or email already exists');
            return res.redirect('/admin/companies/new');
        }
        
        // Create company owner user
        const tempPassword = Math.random().toString(36).substring(2, 10);
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        
        const userResult = await db.query(`
            INSERT INTO users (email, username, password_hash, display_name, role, is_active, is_verified)
            VALUES ($1, $2, $3, $4, 'company', true, true)
            RETURNING id
        `, [email, name.toLowerCase().replace(/\s+/g, '_'), passwordHash, name]);
        
        const ownerId = userResult.rows[0].id;
        
        // Create company
        const companyResult = await db.query(`
            INSERT INTO companies (name, description, website, email, logo_url, owner_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [name, description, website, email, logo_url, ownerId]);
        
        req.flash('success', `Company "${name}" created successfully! Owner login: ${email} / ${tempPassword}`);
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create company: ' + err.message);
        res.redirect('/admin/companies/new');
    }
});

// Edit company page
router.get('/companies/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
        
        if (result.rows.length === 0) {
            req.flash('error', 'Company not found');
            return res.redirect('/admin/companies');
        }
        
        res.render('admin/company-form', {
            title: 'Edit Company',
            company: result.rows[0],
            errors: []
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load company');
        res.redirect('/admin/companies');
    }
});

// Update company POST
router.post('/companies/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { name, description, website, email, logo_url } = req.body;
        
        await db.query(`
            UPDATE companies 
            SET name = $1, description = $2, website = $3, email = $4, logo_url = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
        `, [name, description, website, email, logo_url, req.params.id]);
        
        req.flash('success', 'Company updated successfully');
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update company');
        res.redirect('/admin/companies/' + req.params.id + '/edit');
    }
});

// ==================== PROGRAMS MANAGEMENT ====================

// Create program page
router.get('/programs/new', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const companiesResult = await db.query('SELECT id, name FROM companies ORDER BY name');
        
        res.render('admin/program-form', {
            title: 'Create Program',
            program: null,
            companies: companiesResult.rows,
            errors: []
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load companies');
        res.redirect('/admin/programs');
    }
});

// Create program POST
router.post('/programs/new', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { 
            company_id, name, description, rules, 
            scope, out_of_scope, severity_levels,
            min_bounty, max_bounty, status 
        } = req.body;
        
        if (!company_id || !name) {
            req.flash('error', 'Company and program name are required');
            return res.redirect('/admin/programs/new');
        }
        
        await db.query(`
            INSERT INTO programs (
                company_id, name, description, rules, 
                scope, out_of_scope, severity_levels,
                min_reward, max_reward, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            RETURNING id
        `, [
            company_id, name, description, rules,
            scope, out_of_scope, severity_levels,
            min_bounty || 0, max_bounty || 0, status || 'draft'
        ]).then(async (result) => {
            // Send new program notifications if program is active
            if ((status || 'draft') === 'active') {
                await notifyUsersAboutNewProgram(result.rows[0].id);
            }
        });
        
        req.flash('success', `Program "${name}" created successfully!`);
        res.redirect('/admin/programs');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to create program: ' + err.message);
        res.redirect('/admin/programs/new');
    }
});

// Edit program page
router.get('/programs/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const programResult = await db.query('SELECT * FROM programs WHERE id = $1', [req.params.id]);
        const companiesResult = await db.query('SELECT id, name FROM companies ORDER BY name');
        
        if (programResult.rows.length === 0) {
            req.flash('error', 'Program not found');
            return res.redirect('/admin/programs');
        }
        
        res.render('admin/program-form', {
            title: 'Edit Program',
            program: programResult.rows[0],
            companies: companiesResult.rows,
            errors: []
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load program');
        res.redirect('/admin/programs');
    }
});

// Update program POST
router.post('/programs/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { 
            company_id, name, description, rules, 
            scope, out_of_scope, severity_levels,
            min_bounty, max_bounty, status 
        } = req.body;
        
        await db.query(`
            UPDATE programs 
            SET company_id = $1, name = $2, description = $3, rules = $4,
                scope = $5, out_of_scope = $6, severity_levels = $7,
                min_reward = $8, max_reward = $9, status = $10, updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
        `, [
            company_id, name, description, rules,
            scope, out_of_scope, severity_levels,
            min_bounty || 0, max_bounty || 0, status,
            req.params.id
        ]);
        
        req.flash('success', 'Program updated successfully');
        res.redirect('/admin/programs');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to update program');
        res.redirect('/admin/programs/' + req.params.id + '/edit');
    }
});

// ==================== COMPANY APPROVAL ====================

// Pending companies list
router.get('/companies/pending', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.*, u.id as owner_id, u.email as owner_email
            FROM companies c
            JOIN users u ON c.owner_id = u.id
            WHERE c.status = 'pending'
            ORDER BY c.created_at DESC
        `);
        
        res.render('admin/companies-pending', {
            title: 'Pending Company Approvals',
            companies: result.rows
        });
    } catch (err) {
        console.error(err);
        res.render('admin/companies-pending', { title: 'Pending Company Approvals', companies: [] });
    }
});

// Approve company
router.post('/companies/:id/approve', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get company details
        const companyResult = await db.query(
            'SELECT * FROM companies WHERE id = $1',
            [req.params.id]
        );
        
        if (companyResult.rows.length === 0) {
            req.flash('error', 'Company not found');
            return res.redirect('/admin/companies/pending');
        }
        
        const company = companyResult.rows[0];
        
        // Update company status
        await db.query(
            "UPDATE companies SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [req.params.id]
        );
        
        // Activate owner user
        await db.query(
            "UPDATE users SET is_active = true, is_verified = true, role = 'company' WHERE id = $1",
            [company.owner_id]
        );
        
        // Generate temp password
        const bcrypt = require('bcryptjs');
        const tempPassword = Math.random().toString(36).substring(2, 12);
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, company.owner_id]
        );
        
        // Send approval email
        if (company.contact_email) {
            await sendCompanyApprovalEmail(company.contact_email, company.name, tempPassword);
        }
        
        // Notify company owner
        await db.query(`
            INSERT INTO notifications (user_id, type, message, link, is_read, created_at)
            VALUES ($1, 'company_approved', $2, $3, false, CURRENT_TIMESTAMP)
        `, [
            company.owner_id,
            `Your company "${company.name}" has been approved!`,
            '/company/dashboard'
        ]);
        
        req.flash('success', `Company "${company.name}" approved! Login credentials sent to ${company.contact_email}`);
        res.redirect('/admin/companies/pending');
        
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to approve company');
        res.redirect('/admin/companies/pending');
    }
});

// Reject company
router.post('/companies/:id/reject', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        
        // Get company details
        const companyResult = await db.query(
            'SELECT * FROM companies WHERE id = $1',
            [req.params.id]
        );
        
        if (companyResult.rows.length === 0) {
            req.flash('error', 'Company not found');
            return res.redirect('/admin/companies/pending');
        }
        
        const company = companyResult.rows[0];
        
        // Update company status
        await db.query(
            "UPDATE companies SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [req.params.id]
        );
        
        // Notify company owner
        await db.query(`
            INSERT INTO notifications (user_id, type, message, is_read, created_at)
            VALUES ($1, 'company_rejected', $2, false, CURRENT_TIMESTAMP)
        `, [
            company.owner_id,
            `Your company registration was rejected. Reason: ${reason || 'Not specified'}`
        ]);
        
        req.flash('success', `Company "${company.name}" rejected`);
        res.redirect('/admin/companies/pending');
        
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reject company');
        res.redirect('/admin/companies/pending');
    }
});

// Admin Payments Dashboard
router.get('/payments', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get all payments with user info
        const paymentsResult = await db.query(`
            SELECT p.*, u.email as user_email, u.display_name as user_name
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT 100
        `);
        
        // Calculate stats
        const statsResult = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as total_amount
            FROM payments
        `);
        
        const stats = statsResult.rows[0];
        
        res.render('admin/payments', {
            title: 'Payment Management - Admin',
            payments: paymentsResult.rows,
            stats: {
                total: parseInt(stats.total) || 0,
                completed: parseInt(stats.completed) || 0,
                pending: parseInt(stats.pending) || 0,
                failed: parseInt(stats.failed) || 0,
                totalAmount: parseInt(stats.total_amount) || 0
            }
        });
    } catch (err) {
        console.error('Admin payments error:', err);
        req.flash('error', 'Failed to load payments');
        res.redirect('/admin/dashboard');
    }
});

// Complete payment (admin action)
router.post('/payments/:id/complete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        await db.query(`
            UPDATE payments 
            SET status = 'completed', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [req.params.id]);
        
        req.flash('success', 'Payment marked as completed');
        res.redirect('/admin/payments');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to complete payment');
        res.redirect('/admin/payments');
    }
});

// Cancel payment (admin action)
router.post('/payments/:id/cancel', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        await db.query(`
            UPDATE payments 
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [req.params.id]);
        
        req.flash('success', 'Payment cancelled');
        res.redirect('/admin/payments');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to cancel payment');
        res.redirect('/admin/payments');
    }
});

module.exports = router;
