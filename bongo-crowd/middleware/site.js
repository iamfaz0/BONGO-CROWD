const db = require('../config/database');

// Check if site is in maintenance mode
const checkMaintenance = async (req, res, next) => {
    // Allow admin to access even in maintenance mode
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    
    // Skip maintenance check for these paths
    const skipPaths = ['/maintenance', '/static', '/auth/login', '/admin/login'];
    if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
    }
    
    try {
        const result = await db.query('SELECT * FROM site_settings LIMIT 1');
        if (result.rows.length > 0) {
            const settings = result.rows[0];
            if (settings.maintenance_mode) {
                return res.render('maintenance', { 
                    message: settings.maintenance_message,
                    title: 'Maintenance Mode'
                });
            }
        }
        next();
    } catch (err) {
        console.error('Error checking maintenance mode:', err);
        next();
    }
};

module.exports = { checkMaintenance };
