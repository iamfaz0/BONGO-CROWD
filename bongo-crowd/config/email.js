const nodemailer = require('nodemailer');
const db = require('./database');

// Email transporter configuration
const createTransporter = () => {
    // Check if SMTP settings are configured
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const config = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: parseInt(process.env.SMTP_PORT) === 465, // True for 465, false for 587
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2'
            },
            debug: process.env.NODE_ENV !== 'production',
            logger: process.env.NODE_ENV !== 'production',
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        };
        
        console.log('📧 Email config:', { host: config.host, port: config.port, user: config.auth.user });
        
        return nodemailer.createTransport(config);
    }
    
    // For development, log emails to console
    console.log('⚠️ SMTP not configured. Emails will be logged to console only.');
    return null;
};

const transporter = createTransporter();

// Send email helper
const sendEmail = async (to, subject, html, text) => {
    const siteName = process.env.SITE_NAME || 'BONGO-CROWD';
    
    if (!transporter) {
        console.log('\n📧 EMAIL (Console Mode):');
        console.log('To:', to);
        console.log('Subject:', subject);
        console.log('---');
        console.log(text || 'HTML content');
        console.log('---\n');
        return { success: true, messageId: 'console' };
    }
    
    try {
        // Add timeout to prevent hanging
        const info = await Promise.race([
            transporter.sendMail({
                from: `"${siteName}" <${process.env.SMTP_FROM || 'noreply@bongo-crowd.com'}>`,
                to,
                subject: `[${siteName}] ${subject}`,
                text,
                html
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email timeout')), 10000)
            )
        ]);
        
        console.log('✅ Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error('❌ Email failed:', err.message);
        return { success: false, error: err.message };
    }
};

// Send password reset email
const sendPasswordReset = async (email, token) => {
    const resetUrl = `${process.env.SITE_URL || 'http://104.248.191.90:3000'}/auth/reset-password/${token}`;
    
    const html = `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your BONGO-CROWD account.</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}" style="padding: 10px 20px; background: #7c3aed; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>Or copy this link: ${resetUrl}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
    `;
    
    const text = `
Password Reset Request

You requested a password reset for your BONGO-CROWD account.

Reset your password: ${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
    `;
    
    return sendEmail(email, 'Password Reset Request', html, text);
};

// Send new program notification
const sendNewProgramNotification = async (userEmail, program) => {
    const programUrl = `${process.env.SITE_URL || 'http://104.248.191.90:3000'}/programs/${program.id}`;
    
    const html = `
        <h2>New Bug Bounty Program Available!</h2>
        <p>Hi there,</p>
        <p>A new bug bounty program has been launched on BONGO-CROWD:</p>
        <div style="border: 1px solid #7c3aed; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #7c3aed;">${program.name}</h3>
            <p><strong>Company:</strong> ${program.company_name}</p>
            <p><strong>Bounty Range:</strong> $${program.min_reward} - $${program.max_reward}</p>
            ${program.description ? `<p>${program.description.substring(0, 200)}...</p>` : ''}
        </div>
        <p><a href="${programUrl}" style="padding: 12px 24px; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: white; text-decoration: none; border-radius: 8px; display: inline-block;">View Program</a></p>
        <p>Happy hunting!</p>
        <p>The BONGO-CROWD Team</p>
    `;
    
    const text = `
New Bug Bounty Program Available!

Hi there,

A new bug bounty program has been launched on BONGO-CROWD:

${program.name}
Company: ${program.company_name}
Bounty Range: $${program.min_reward} - $${program.max_reward}

View Program: ${programUrl}

Happy hunting!
The BONGO-CROWD Team
    `;
    
    return sendEmail(userEmail, `New Program: ${program.name}`, html, text);
};

// Notify users about new program
const notifyUsersAboutNewProgram = async (programId) => {
    try {
        // Get program details with company name
        const programResult = await db.query(`
            SELECT p.*, c.name as company_name
            FROM programs p
            JOIN companies c ON p.company_id = c.id
            WHERE p.id = $1
        `, [programId]);
        
        if (programResult.rows.length === 0) return;
        
        const program = programResult.rows[0];
        
        // Get users who want new program notifications
        const usersResult = await db.query(`
            SELECT u.id, u.email
            FROM users u
            JOIN notification_preferences np ON u.id = np.user_id
            WHERE np.new_programs = true
            AND u.is_active = true
            AND u.email IS NOT NULL
        `);
        
        // Send notifications (throttled to avoid rate limits)
        const batchSize = 10;
        for (let i = 0; i < usersResult.rows.length; i += batchSize) {
            const batch = usersResult.rows.slice(i, i + batchSize);
            
            await Promise.all(batch.map(user => 
                sendNewProgramNotification(user.email, program)
            ));
            
            // Small delay between batches
            if (i + batchSize < usersResult.rows.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`✅ Sent new program notifications to ${usersResult.rows.length} users`);
    } catch (err) {
        console.error('Failed to send new program notifications:', err);
    }
};

// Send company approval email
const sendCompanyApprovalEmail = async (email, companyName, tempPassword) => {
    const loginUrl = `${process.env.SITE_URL || 'http://104.248.191.90:3000'}/auth/login`;
    
    const html = `
        <h2>Company Registration Approved!</h2>
        <p>Congratulations! Your company <strong>${companyName}</strong> has been approved on BONGO-CROWD.</p>
        <p>Your account has been activated. Here are your login credentials:</p>
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p><a href="${loginUrl}" style="padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; display: inline-block;">Login to Your Account</a></p>
        <p><strong>Important:</strong> Please change your password after logging in.</p>
        <p>Welcome to BONGO-CROWD!</p>
    `;
    
    const text = `
Company Registration Approved!

Congratulations! Your company ${companyName} has been approved on BONGO-CROWD.

Your account has been activated. Here are your login credentials:

Email: ${email}
Temporary Password: ${tempPassword}

Login: ${loginUrl}

Important: Please change your password after logging in.

Welcome to BONGO-CROWD!
    `;
    
    return sendEmail(email, 'Company Registration Approved', html, text);
};

module.exports = {
    sendEmail,
    sendPasswordReset,
    sendNewProgramNotification,
    notifyUsersAboutNewProgram,
    sendCompanyApprovalEmail
};
