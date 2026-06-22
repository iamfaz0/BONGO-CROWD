const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./database');

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const result = await db.query(
            'SELECT id, email, username, display_name, role, avatar_url, reputation, points, is_active, is_banned FROM users WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return done(null, false);
        }
        
        done(null, result.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Local Strategy (Email/Password)
passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        try {
            console.log('Login attempt for:', email);
            const result = await db.query(
                'SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL',
                [email.toLowerCase()]
            );
            
            console.log('Found users:', result.rows.length);
            
            if (result.rows.length === 0) {
                return done(null, false, { message: 'Invalid email or password' });
            }
            
            const user = result.rows[0];
            console.log('User:', user.email, '| Active:', user.is_active, '| Banned:', user.is_banned);
            
            // Check if user is banned
            if (user.is_banned) {
                return done(null, false, { message: 'Account has been suspended' });
            }
            
            // Check if user is active
            if (!user.is_active) {
                return done(null, false, { message: 'Please verify your email first' });
            }
            
            // Verify password
            const isMatch = await bcrypt.compare(password, user.password_hash);
            console.log('Password match:', isMatch);
            
            if (!isMatch) {
                return done(null, false, { message: 'Invalid email or password' });
            }
            
            // Update last login
            await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
            
            console.log('Login successful for:', user.email);
            return done(null, user);
        } catch (err) {
            console.error('Passport error:', err);
            return done(err);
        }
    }
));

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user exists with this Google ID
                let result = await db.query(
                    'SELECT * FROM users WHERE google_id = $1',
                    [profile.id]
                );
                
                if (result.rows.length > 0) {
                    const user = result.rows[0];
                    
                    if (user.is_banned) {
                        return done(null, false, { message: 'Account has been suspended' });
                    }
                    
                    // Update last login
                    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
                    
                    return done(null, user);
                }
                
                // Check if email already exists
                result = await db.query(
                    'SELECT * FROM users WHERE email = $1',
                    [profile.emails[0].value.toLowerCase()]
                );
                
                if (result.rows.length > 0) {
                    // Link Google account to existing user
                    await db.query(
                        'UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3',
                        [profile.id, profile.photos[0]?.value, result.rows[0].id]
                    );
                    return done(null, result.rows[0]);
                }
                
                // Create new user
                const username = profile.displayName.toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(Math.random() * 10000);
                
                const insertResult = await db.query(
                    `INSERT INTO users (email, username, display_name, google_id, avatar_url, is_verified, is_active) 
                     VALUES ($1, $2, $3, $4, $5, true, true) 
                     RETURNING *`,
                    [
                        profile.emails[0].value.toLowerCase(),
                        username,
                        profile.displayName,
                        profile.id,
                        profile.photos[0]?.value
                    ]
                );
                
                return done(null, insertResult.rows[0]);
            } catch (err) {
                return done(err);
            }
        }
    ));
}

module.exports = passport;
