-- Payments table for M-Pesa integration
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'refund', 'fee')),
    amount INTEGER NOT NULL,
    phone_number VARCHAR(20),
    transaction_id VARCHAR(255),
    reference VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Company wallet/balance tracking
CREATE TABLE IF NOT EXISTS company_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 0,
    total_deposited INTEGER DEFAULT 0,
    total_paid_out INTEGER DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'TZS',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id)
);

-- User wallet/balance tracking
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    total_earned INTEGER DEFAULT 0,
    total_withdrawn INTEGER DEFAULT 0,
    pending_withdrawal INTEGER DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'TZS',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_wallets_company_id ON company_wallets(company_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);

-- Function to update wallet balances
CREATE OR REPLACE FUNCTION update_user_wallet_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND NEW.type = 'withdrawal' THEN
        UPDATE user_wallets 
        SET total_withdrawn = total_withdrawn + NEW.amount,
            pending_withdrawal = pending_withdrawal - NEW.amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = NEW.user_id;
    ELSIF NEW.status = 'processing' AND NEW.type = 'withdrawal' THEN
        UPDATE user_wallets 
        SET pending_withdrawal = pending_withdrawal + NEW.amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for wallet updates
DROP TRIGGER IF EXISTS trigger_update_user_wallet ON payments;
CREATE TRIGGER trigger_update_user_wallet
AFTER UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_user_wallet_on_payment();

-- Insert initial wallet records for existing users
INSERT INTO user_wallets (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Insert initial wallet records for existing companies
INSERT INTO company_wallets (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

SELECT 'Payments tables and triggers created successfully' as status;
