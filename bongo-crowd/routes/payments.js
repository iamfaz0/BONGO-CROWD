const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../config/database');
const { 
    initiateB2CPayment, 
    initiateC2BPayment, 
    checkTransactionStatus,
    handlePaymentCallback 
} = require('../config/payments/mpesa');

// Payment page
router.get('/payments', ensureAuthenticated, async (req, res) => {
    try {
        // Get user's payment history
        const paymentsResult = await db.query(`
            SELECT * FROM payments 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 20
        `, [req.user.id]);
        
        // Get user's balance
        const balanceResult = await db.query(`
            SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as balance
            FROM payments 
            WHERE user_id = $1 AND type = 'withdrawal'
        `, [req.user.id]);
        
        res.render('payments/index', {
            title: 'Payments - BONGO-CROWD',
            payments: paymentsResult.rows,
            balance: balanceResult.rows[0]?.balance || 0,
            mpesaEnabled: !!process.env.MPESA_API_KEY
        });
    } catch (err) {
        console.error('Payments error:', err);
        req.flash('error', 'Failed to load payments');
        res.redirect('/dashboard');
    }
});

// Withdraw to M-Pesa
router.post('/payments/withdraw', ensureAuthenticated, async (req, res) => {
    const { phoneNumber, amount } = req.body;
    
    if (!phoneNumber || !amount) {
        return res.status(400).json({ error: 'Phone number and amount required' });
    }
    
    // Validate phone number (Tanzanian format)
    const phoneRegex = /^(?:\+255|0)?[67]\d{8}$/;
    if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format. Use 07XXXXXXXX or +2557XXXXXXXX' });
    }
    
    // Check minimum withdrawal
    const minWithdrawal = parseInt(process.env.MIN_WITHDRAWAL) || 10000; // 10,000 TZS default
    if (parseInt(amount) < minWithdrawal) {
        return res.status(400).json({ error: `Minimum withdrawal is ${minWithdrawal} TZS` });
    }
    
    try {
        // Check user's available balance
        const balanceResult = await db.query(`
            SELECT COALESCE(SUM(bounty_amount), 0) as total_earned
            FROM reports 
            WHERE researcher_id = $1 AND bounty_paid = true
        `, [req.user.id]);
        
        const totalEarned = parseInt(balanceResult.rows[0]?.total_earned) || 0;
        
        // Check pending withdrawals
        const pendingResult = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as pending
            FROM payments 
            WHERE user_id = $1 AND type = 'withdrawal' AND status = 'pending'
        `, [req.user.id]);
        
        const pending = parseInt(pendingResult.rows[0]?.pending) || 0;
        const available = totalEarned - pending;
        
        if (parseInt(amount) > available) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Create payment record
        const paymentResult = await db.query(`
            INSERT INTO payments (user_id, type, amount, phone_number, status, reference)
            VALUES ($1, 'withdrawal', $2, $3, 'pending', $4)
            RETURNING id
        `, [req.user.id, amount, phoneNumber, `WDW_${Date.now()}`]);
        
        const paymentId = paymentResult.rows[0].id;
        
        // Initiate M-Pesa payment
        const mpesaResult = await initiateB2CPayment(
            phoneNumber,
            amount,
            `BONGO_WDW_${paymentId}`,
            `Bounty withdrawal for ${req.user.username}`
        );
        
        if (mpesaResult.success) {
            // Update payment with transaction ID
            await db.query(`
                UPDATE payments 
                SET transaction_id = $1, status = 'processing'
                WHERE id = $2
            `, [mpesaResult.transactionId, paymentId]);
            
            res.json({ 
                success: true, 
                message: 'Withdrawal initiated. You will receive M-Pesa confirmation shortly.',
                transactionId: mpesaResult.transactionId
            });
        } else {
            // Mark as failed
            await db.query(`
                UPDATE payments 
                SET status = 'failed', error_message = $1
                WHERE id = $2
            `, [mpesaResult.error, paymentId]);
            
            res.status(500).json({ 
                error: 'M-Pesa payment failed: ' + mpesaResult.error 
            });
        }
    } catch (err) {
        console.error('Withdrawal error:', err);
        res.status(500).json({ error: 'Failed to process withdrawal' });
    }
});

// Company deposit (C2B)
router.post('/payments/deposit', ensureAuthenticated, async (req, res) => {
    const { phoneNumber, amount, companyId } = req.body;
    
    if (!phoneNumber || !amount || !companyId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate phone
    const phoneRegex = /^(?:\+255|0)?[67]\d{8}$/;
    if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    try {
        // Verify user owns the company
        const companyResult = await db.query(`
            SELECT * FROM companies 
            WHERE id = $1 AND (admin_id = $2 OR owner_id = $2)
        `, [companyId, req.user.id]);
        
        if (companyResult.rows.length === 0) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Create payment record
        const paymentResult = await db.query(`
            INSERT INTO payments (user_id, company_id, type, amount, phone_number, status, reference)
            VALUES ($1, $2, 'deposit', $3, $4, 'pending', $5)
            RETURNING id
        `, [req.user.id, companyId, amount, phoneNumber, `DEP_${Date.now()}`]);
        
        const paymentId = paymentResult.rows[0].id;
        
        // Initiate C2B payment (customer pays to business)
        const mpesaResult = await initiateC2BPayment(
            phoneNumber,
            amount,
            `BONGO_DEP_${paymentId}`,
            `Deposit for ${companyResult.rows[0].name}`
        );
        
        if (mpesaResult.success) {
            await db.query(`
                UPDATE payments 
                SET transaction_id = $1, status = 'processing'
                WHERE id = $2
            `, [mpesaResult.transactionId, paymentId]);
            
            res.json({ 
                success: true, 
                message: 'Please complete payment on your phone',
                transactionId: mpesaResult.transactionId
            });
        } else {
            await db.query(`
                UPDATE payments 
                SET status = 'failed', error_message = $1
                WHERE id = $2
            `, [mpesaResult.error, paymentId]);
            
            res.status(500).json({ error: mpesaResult.error });
        }
    } catch (err) {
        console.error('Deposit error:', err);
        res.status(500).json({ error: 'Failed to process deposit' });
    }
});

// Check payment status
router.get('/payments/status/:transactionId', ensureAuthenticated, async (req, res) => {
    try {
        const result = await checkTransactionStatus(req.params.transactionId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// M-Pesa webhook callback
router.post('/payments/webhook/mpesa', (req, res) => {
    handlePaymentCallback(req, res);
});

// Payment history API
router.get('/api/payments', ensureAuthenticated, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, c.name as company_name
            FROM payments p
            LEFT JOIN companies c ON p.company_id = c.id
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
            LIMIT 50
        `, [req.user.id]);
        
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

module.exports = router;
