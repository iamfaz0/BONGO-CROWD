const db = require('../config/database');

// Load site settings into app locals
const loadSiteSettings = async (app) => {
    try {
        const result = await db.query('SELECT * FROM site_settings LIMIT 1');
        if (result.rows.length > 0) {
            app.locals.site = result.rows[0];
        } else {
            // Create default settings
            await db.query(`
                INSERT INTO site_settings (id, site_name, footer_text) VALUES (1, 'BONGO-CROWD', 'Made with ❤️ in Tanzania')
                ON CONFLICT (id) DO NOTHING
            `);
            app.locals.site = { site_name: 'BONGO-CROWD', footer_text: 'Made with ❤️ in Tanzania' };
        }
    } catch (err) {
        console.error('Error loading site settings:', err);
        app.locals.site = { site_name: 'BONGO-CROWD', footer_text: 'Made with ❤️ in Tanzania' };
    }
};

// Refresh site settings
const refreshSiteSettings = async (app) => {
    await loadSiteSettings(app);
};

// Generate report ID (e.g., BC-2024-0001)
const generateReportId = async () => {
    const year = new Date().getFullYear();
    const prefix = `BC-${year}`;
    
    const result = await db.query(`
        SELECT COUNT(*) as count FROM reports 
        WHERE report_id LIKE $1
    `, [`${prefix}-%`]);
    
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}-${String(count).padStart(4, '0')}`;
};

// Slug generator
const generateSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 100);
};

// Format currency
const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
};

// Calculate time ago
const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
        }
    }
    
    return 'just now';
};

module.exports = {
    loadSiteSettings,
    refreshSiteSettings,
    generateReportId,
    generateSlug,
    formatCurrency,
    timeAgo
};
