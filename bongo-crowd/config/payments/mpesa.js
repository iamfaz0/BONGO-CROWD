/**
 * M-Pesa Payment Integration for BONGO-CROWD
 * Tanzania - Vodacom M-Pesa OpenAPI
 * 
 * Documentation: https://business.m-pesa.com/developers/
 */

const axios = require('axios');
const crypto = require('crypto');

// M-Pesa API Configuration
const MPESA_CONFIG = {
    // Sandbox environment (for testing)
    sandbox: {
        baseURL: 'https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomTZN',
        apiKey: process.env.MPESA_SANDBOX_API_KEY,
        publicKey: process.env.MPESA_SANDBOX_PUBLIC_KEY,
        serviceProviderCode: process.env.MPESA_SANDBOX_SP_CODE || '000000'
    },
    // Production environment
    production: {
        baseURL: 'https://openapi.m-pesa.com/ipg/v2/vodacomTZN',
        apiKey: process.env.MPESA_API_KEY,
        publicKey: process.env.MPESA_PUBLIC_KEY,
        serviceProviderCode: process.env.MPESA_SP_CODE
    }
};

// Get current environment config
const getConfig = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return isProduction ? MPESA_CONFIG.production : MPESA_CONFIG.sandbox;
};

/**
 * Generate Bearer Token for API authentication
 */
const generateBearerToken = async () => {
    const config = getConfig();
    
    try {
        const response = await axios.post(
            `${config.baseURL}/oauth/token`,
            {
                grant_type: 'client_credentials'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`${config.apiKey}:`).toString('base64')}`
                }
            }
        );
        
        return response.data.access_token;
    } catch (error) {
        console.error('M-Pesa token generation failed:', error.message);
        throw new Error('Failed to authenticate with M-Pesa');
    }
};

/**
 * Initiate C2B Payment (Customer to Business)
 * Used when a researcher withdraws bounty to M-Pesa
 */
const initiateB2CPayment = async (phoneNumber, amount, reference, description) => {
    const config = getConfig();
    const token = await generateBearerToken();
    
    // Format phone number (remove + and add country code if needed)
    const formattedPhone = phoneNumber.replace(/^\+?/, '');
    
    const requestBody = {
        input_TransactionReference: reference,
        input_CustomerMSISDN: formattedPhone,
        input_Amount: amount.toString(),
        input_ThirdPartyReference: `BONGO_${Date.now()}`,
        input_ServiceProviderCode: config.serviceProviderCode,
        input_TransactionDescription: description || 'BONGO-CROWD Bounty Payment'
    };
    
    try {
        const response = await axios.post(
            `${config.baseURL}/b2cPayment/`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        return {
            success: true,
            transactionId: response.data.output_TransactionID,
            reference: response.data.output_ConversationID,
            status: response.data.output_ResponseCode === '0' ? 'success' : 'pending'
        };
    } catch (error) {
        console.error('M-Pesa B2C payment failed:', error.message);
        return {
            success: false,
            error: error.response?.data?.errorMessage || error.message
        };
    }
};

/**
 * Initiate C2B Payment (Company deposits to platform)
 */
const initiateC2BPayment = async (phoneNumber, amount, reference, description) => {
    const config = getConfig();
    const token = await generateBearerToken();
    
    const formattedPhone = phoneNumber.replace(/^\+?/, '');
    
    const requestBody = {
        input_Amount: amount.toString(),
        input_Country: 'TZN',
        input_Currency: 'TZS',
        input_CustomerMSISDN: formattedPhone,
        input_ServiceProviderCode: config.serviceProviderCode,
        input_ThirdPartyReference: `BONGO_${Date.now()}`,
        input_TransactionReference: reference,
        input_PurchasedItemsDesc: description || 'BONGO-CROWD Deposit'
    };
    
    try {
        const response = await axios.post(
            `${config.baseURL}/c2bPayment/singleStage/`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        return {
            success: true,
            transactionId: response.data.output_TransactionID,
            reference: response.data.output_ConversationID,
            status: response.data.output_ResponseCode === '0' ? 'success' : 'pending'
        };
    } catch (error) {
        console.error('M-Pesa C2B payment failed:', error.message);
        return {
            success: false,
            error: error.response?.data?.errorMessage || error.message
        };
    }
};

/**
 * Check Transaction Status
 */
const checkTransactionStatus = async (transactionId) => {
    const config = getConfig();
    const token = await generateBearerToken();
    
    try {
        const response = await axios.get(
            `${config.baseURL}/transactionStatus/${transactionId}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        return {
            success: true,
            status: response.data.output_ResultDesc,
            amount: response.data.output_Amount,
            timestamp: response.data.output_TransactionCompletedDateTime
        };
    } catch (error) {
        console.error('M-Pesa status check failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Verify Webhook Signature
 */
const verifyWebhookSignature = (payload, signature, secret) => {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    
    return signature === expectedSignature;
};

/**
 * Handle Payment Callback/Webhook
 */
const handlePaymentCallback = (req, res) => {
    const signature = req.headers['x-mpesa-signature'];
    const secret = process.env.MPESA_WEBHOOK_SECRET;
    
    // Verify signature if configured
    if (secret && signature) {
        if (!verifyWebhookSignature(req.body, signature, secret)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    const { output_ResponseCode, output_TransactionID, output_ResultDesc } = req.body;
    
    // Process the callback
    console.log('M-Pesa callback received:', {
        transactionId: output_TransactionID,
        status: output_ResponseCode,
        description: output_ResultDesc
    });
    
    // Update transaction in database
    // TODO: Update payment status in database
    
    res.status(200).json({ received: true });
};

module.exports = {
    initiateB2CPayment,
    initiateC2BPayment,
    checkTransactionStatus,
    handlePaymentCallback,
    getConfig
};
