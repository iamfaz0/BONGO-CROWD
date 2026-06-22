const nodemailer = require('nodemailer');

async function testSMTP() {
    console.log('Testing SMTP with App Password...\n');
    console.log('Config:');
    console.log('  Host:', process.env.SMTP_HOST);
    console.log('  Port:', process.env.SMTP_PORT);
    console.log('  User:', process.env.SMTP_USER);
    console.log('  Pass length:', process.env.SMTP_PASS?.length || 0, 'chars');
    
    // Create transporter with Gmail-specific settings
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS?.replace(/['"]/g, '') // Remove quotes if present
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000
    });
    
    try {
        console.log('\n⏳ Verifying connection...');
        await transporter.verify();
        console.log('✅ SMTP Connection successful!\n');
        
        // Send test email
        console.log('⏳ Sending test email to', process.env.SMTP_USER);
        const info = await transporter.sendMail({
            from: `BONGO-CROWD <${process.env.SMTP_FROM}>`,
            to: process.env.SMTP_USER,
            subject: '✅ SMTP Test - BONGO-CROWD Platform',
            text: `Hello from BONGO-CROWD!

This is a test email to confirm your SMTP configuration is working correctly.

Configuration:
- Host: ${process.env.SMTP_HOST}
- Port: ${process.env.SMTP_PORT}
- User: ${process.env.SMTP_USER}

If you received this email, your password reset and notification features are ready!

Best regards,
BONGO-CROWD Team`,
            html: `
                <h2 style="color: #7c3aed;">✅ SMTP Test Successful!</h2>
                <p>Hello from <strong>BONGO-CROWD</strong>!</p>
                <p>This is a test email to confirm your SMTP configuration is working correctly.</p>
                <h3>Configuration:</h3>
                <ul>
                    <li><strong>Host:</strong> ${process.env.SMTP_HOST}</li>
                    <li><strong>Port:</strong> ${process.env.SMTP_PORT}</li>
                    <li><strong>User:</strong> ${process.env.SMTP_USER}</li>
                </ul>
                <p style="background: #dcfce7; padding: 15px; border-radius: 8px;">
                    <strong>✅ If you received this email, your password reset and notification features are ready!</strong>
                </p>
                <p>Best regards,<br>BONGO-CROWD Team</p>
            `
        });
        
        console.log('✅ Test email sent successfully!');
        console.log('   Message ID:', info.messageId);
        console.log('   To:', info.accepted.join(', '));
        
    } catch (err) {
        console.error('\n❌ SMTP Error:');
        console.error('   Code:', err.code);
        console.error('   Message:', err.message);
        if (err.response) {
            console.error('   Server Response:', err.response);
        }
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Verify 2FA is enabled on your Google account');
        console.error('   2. Generate new App Password at https://myaccount.google.com/apppasswords');
        console.error('   3. Copy the 16-character password exactly (no spaces)');
        console.error('   4. Update .env file and restart server');
    } finally {
        transporter.close();
    }
}

testSMTP();
