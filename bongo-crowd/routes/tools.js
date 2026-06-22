const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');

// Bounty Calculator Page
router.get('/bounty-calculator', async (req, res) => {
    try {
        // Get severity matrix
        const severityResult = await db.query(`
            SELECT severity, cvss_min, cvss_max, min_bounty, max_bounty, 
                   description, color, icon
            FROM severity_matrix
            WHERE is_active = true
            ORDER BY cvss_max DESC
        `);

        // Get active programs with bounty ranges
        const programsResult = await db.query(`
            SELECT p.id, p.name, p.slug, p.critical_reward_min, p.critical_reward_max,
                   p.high_reward_min, p.high_reward_max, p.medium_reward_min, 
                   p.medium_reward_max, p.low_reward_min, p.low_reward_max,
                   c.name as company_name
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            WHERE p.status = 'active'
            ORDER BY p.name
        `);

        res.render('tools/bounty-calculator', {
            title: 'Bounty Calculator',
            severityMatrix: severityResult.rows,
            programs: programsResult.rows
        });
    } catch (err) {
        console.error('Bounty calculator error:', err);
        res.render('tools/bounty-calculator', {
            title: 'Bounty Calculator',
            severityMatrix: [],
            programs: [],
            error: 'Failed to load calculator data'
        });
    }
});

module.exports = router;