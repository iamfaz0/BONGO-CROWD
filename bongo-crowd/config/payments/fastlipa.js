/**
 * FastLipa Payment Integration for BONGO-CROWD
 * Tanzania - FastLipa API
 * 
 * Documentation: https://api.fastlipa.com/api/docs
 */

const axios = require('axios');

// FastLipa API Configuration
const FASTLIPA_CONFIG = {
    sandbox: {
        baseURL: 'https://api.fastlipa.com/api/v1',
        apiKey: process.env.FASTLIPA_SANDBOX_API_KEY
    },
    production: {
        baseURL: 'https://api.fastlipa.com/api/v1',
        apiKey: process.env.FASTLIPA_API_KEY
    }
};

// Get current environment config
const getConfig = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return isProduction ? FASTLIPA_CONFIG.production : FASTLIPA_CONFIG.sandbox;
};

/**
 * Create API client with authentication
 */
const createClient = () => {
    const config = getConfig();
    return axios.create({
        baseURL: config.baseURL,
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        }
    });
};

/**
 * Initiate Payment Request (C2B)
 * Used when companies deposit money to platform
 */
const initiatePayment = async (phoneNumber, amount, reference, description) => {
    const client = createClient();
    
    try {
        const response = await client.post('/payments/request', {
            phone_number: phoneNumber,
            amount: amount.toString(),
            currency: 'TZS',
            reference: reference,
            description: description || 'BONGO-CROWD Deposit',
            callback_url: `${process.env.SITE_URL}/payments/webhook/fastlipa`
        });
        
        return {
            success: true,
            transactionId: response.data.transaction_id,
            reference: response.data.reference,
            status: response.data.status,
            message: response.data.message
        };
    } catch (error) {
        console.error('FastLipa payment initiation failed:', error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
};

/**
 * Initiate Payout/Withdrawal (B2C)
 * Used when sending bounty to researcher M-Pesa/Airtel Money
 */
const initiatePayout = async (phoneNumber, amount, reference, description) => {
    const client = createClient();
    
    try {
        const response = await client.post('/payments/payout', {
            phone_number: phoneNumber,
            amount: amount.toString(),
            currency: 'TZS',
            reference: reference,
            description: description || 'BONGO-CROWD Bounty Payment',
            callback_url: `${process.env.SITE_URL}/payments/webhook/fastlipa`
        });
        
        return {
            success: true,
            transactionId: response.data.transaction_id,
            reference: response.data.reference,
            status: response.data.status
        };
    } catch (error) {
        console.error('FastLipa payout failed:', error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
};

/**
 * Check Transaction Status
 */
const checkTransactionStatus = async (transactionId) => {
    const client = createClient();
    
    try {
        const response = await client.get(`/transactions/${transactionId}`);
        
        return {
            success: true,
            transactionId: response.data.id,
            status: response.data.status,
            amount: response.data.amount,
            phoneNumber: response.data.phone_number,
            createdAt: response.data.created_at,
            updatedAt: response.data.updated_at
        };
    } catch (error) {
        console.error('FastLipa status check failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Verify Webhook Signature
 * FastLipa signs webhooks for security
 */
const verifyWebhookSignature = (payload, signature, secret) => {
    const crypto = require('crypto');
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    
    return signature === expectedSignature;
};

/**
 * Handle Payment Callback/Webhook
 */
const handleWebhook = (req, res) => {
    const signature = req.headers['x-fastlipa-signature'];
    const secret = process.env.FASTLIPA_WEBHOOK_SECRET;
    
    // Verify signature if configured
    if (secret && signature) {
        if (!verifyWebhookSignature(req.body, signature, secret)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    const { transaction_id, status, amount, phone_number, reference } = req.body;
    
    console.log('FastLipa webhook received:', {
        transactionId: transaction_id,
        status: status,
        amount: amount,
        reference: reference
    });
    
    // TODO: Update payment status in database
    
    res.status(200).json({ received: true });
};

/**
 * Get Wallet Balance
 */
const getWalletBalance = async () => {
    const client = createClient();
    
    try {
        const response = await client.get('/wallet/balance');
        
        return {
            success: true,
            balance: response.data.balance,
            currency: response.data.currency
        };
    } catch (error) {
        console.error('FastLipa balance check failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    initiatePayment,
    initiatePayout,
    checkTransactionStatus,
    handleWebhook,
    getWalletBalance,
    getConfig
};
