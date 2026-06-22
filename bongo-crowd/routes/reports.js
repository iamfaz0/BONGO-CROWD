const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated, ensureHacker } = require('../middleware/auth');
const { generateReportId } = require('../utils/site');
const { reportUpload, handleMulterError } = require('../middleware/upload');
const path = require('path');

// Submit report form
router.get('/submit', ensureAuthenticated, ensureHacker, async (req, res) => {
    try {
        const programsResult = await db.query(`
            SELECT id, name, slug, min_reward, max_reward,
                   critical_reward_min, critical_reward_max,
                   high_reward_min, high_reward_max,
                   medium_reward_min, medium_reward_max,
                   low_reward_min, low_reward_max
            FROM programs
            WHERE status = 'active'
            ORDER BY name
        `);
        
        res.render('reports/submit', {
            title: 'Submit Vulnerability Report',
            programs: programsResult.rows
        });
    } catch (err) {
        console.error(err);
        res.redirect('/programs');
    }
});

// Submit report POST
router.post('/submit', ensureAuthenticated, ensureHacker, reportUpload.array('attachments', 5), handleMulterError, async (req, res) => {
    const { 
        program_id, title, vulnerability_type, severity, 
        description, impact, reproduction_steps, proof_of_concept 
    } = req.body;
    
    try {
        // Check if user can submit to this program
        const programCheck = await db.query(
            'SELECT id, status FROM programs WHERE id = $1',
            [program_id]
        );
        
        if (programCheck.rows.length === 0 || programCheck.rows[0].status !== 'active') {
            req.flash('error', 'This program is not accepting reports at this time');
            return res.redirect('/programs');
        }
        
        // Generate unique report ID
        const reportId = await generateReportId();
        
        // Process uploaded files
        const attachments = req.files && req.files.length > 0 ? 
            JSON.stringify(req.files.map(f => ({
                filename: f.filename,
                originalname: f.originalname,
                mimetype: f.mimetype,
                size: f.size
            }))) : null;

        // Create report
        const result = await db.query(`
            INSERT INTO reports (
                report_id, program_id, researcher_id, title, vulnerability_type,
                severity, description, impact, reproduction_steps, proof_of_concept,
                attachments
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, report_id
        `, [
            reportId, program_id, req.user.id, title, vulnerability_type,
            severity, description, impact, reproduction_steps, proof_of_concept,
            attachments
        ]);
        
        // Update program stats
        await db.query(
            'UPDATE programs SET total_reports = total_reports + 1 WHERE id = $1',
            [program_id]
        );
        
        req.flash('success', `Report submitted successfully! ID: ${reportId}`);
        res.redirect(`/reports/${reportId}`);
        
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to submit report. Please try again.');
        res.redirect('/reports/submit');
    }
});

// View single report
router.get('/:id', ensureAuthenticated, async (req, res) => {
    try {
        const reportResult = await db.query(`
            SELECT r.*, p.name as program_name, p.slug as program_slug,
                   c.name as company_name, u.username as researcher_username,
                   u.avatar_url as researcher_avatar
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            JOIN companies c ON p.company_id = c.id
            JOIN users u ON r.researcher_id = u.id
            WHERE r.report_id = $1
        `, [req.params.id]);
        
        if (reportResult.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'Report Not Found',
                message: 'This report does not exist.'
            });
        }
        
        const report = reportResult.rows[0];
        
        // Parse attachments JSON
        if (report.attachments) {
            try {
                report.attachments = JSON.parse(report.attachments);
            } catch (e) {
                report.attachments = [];
            }
        } else {
            report.attachments = [];
        }
        
        // Check permissions
        const isResearcher = report.researcher_id === req.user.id;
        const isAdmin = req.user.role === 'admin';
        const isCompany = req.user.role === 'company' && await isCompanyAdmin(req.user.id, report.program_id);
        
        if (!isResearcher && !isAdmin && !isCompany) {
            // Check if report is disclosed
            if (!report.disclosure_allowed || !report.disclosed_at) {
                return res.status(403).render('error', {
                    title: 'Access Denied',
                    message: 'You do not have permission to view this report.'
                });
            }
        }
        
        // Get comments
        const commentsResult = await db.query(`
            SELECT rc.*, u.username, u.avatar_url, u.role
            FROM report_comments rc
            JOIN users u ON rc.user_id = u.id
            WHERE rc.report_id = $1 AND (rc.is_internal = false OR $2 = true)
            ORDER BY rc.created_at ASC
        `, [report.id, isAdmin || isCompany]);
        
        res.render('reports/show', {
            title: `Report ${report.report_id}`,
            report,
            comments: commentsResult.rows,
            isResearcher,
            isAdmin,
            isCompany
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
});

// My reports
router.get('/my/reports', ensureAuthenticated, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT r.*, p.name as program_name, p.slug as program_slug
            FROM reports r
            JOIN programs p ON r.program_id = p.id
            WHERE r.researcher_id = $1
            ORDER BY r.created_at DESC
        `, [req.user.id]);
        
        res.render('reports/my-reports', {
            title: 'My Reports',
            reports: result.rows
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
});

// Add comment
router.post('/:id/comment', ensureAuthenticated, async (req, res) => {
    const { content, is_internal } = req.body;
    const reportId = req.params.id;
    
    try {
        await db.query(`
            INSERT INTO report_comments (report_id, user_id, content, is_internal)
            VALUES ((SELECT id FROM reports WHERE report_id = $1), $2, $3, $4)
        `, [reportId, req.user.id, content, is_internal === 'true']);
        
        req.flash('success', 'Comment added');
        res.redirect(`/reports/${reportId}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to add comment');
        res.redirect(`/reports/${reportId}`);
    }
});

// Helper function
async function isCompanyAdmin(userId, programId) {
    const result = await db.query(`
        SELECT 1 FROM companies c
        JOIN programs p ON p.company_id = c.id
        WHERE p.id = $1 AND c.admin_id = $2
    `, [programId, userId]);
    return result.rows.length > 0;
}

module.exports = router;
