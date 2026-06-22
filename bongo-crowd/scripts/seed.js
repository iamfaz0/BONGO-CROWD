const db = require('../config/database');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('🌱 Seeding database...');

    try {
        // Create admin user
        const adminPassword = await bcrypt.hash('admin123', 10);
        const adminResult = await db.query(`
            INSERT INTO users (email, username, password_hash, display_name, role, is_verified, is_active)
            VALUES ('admin@bongo-crowd.com', 'admin', $1, 'System Admin', 'admin', true, true)
            ON CONFLICT (email) DO NOTHING
            RETURNING id
        `, [adminPassword]);

        // Create sample companies
        const companies = [
            {
                name: 'Tanzania National Bank',
                slug: 'tnb',
                description: 'Leading financial institution in Tanzania',
                industry: 'Finance',
                size: '5000+',
                location: 'Dar es Salaam, Tanzania'
            },
            {
                name: 'NMB Bank',
                slug: 'nmb',
                description: 'National Microfinance Bank',
                industry: 'Finance',
                size: '2000-5000',
                location: 'Dar es Salaam, Tanzania'
            },
            {
                name: 'Jumia Tanzania',
                slug: 'jumia-tz',
                description: 'Leading e-commerce platform',
                industry: 'E-commerce',
                size: '100-500',
                location: 'Dar es Salaam, Tanzania'
            }
        ];

        for (const company of companies) {
            // Create company admin user
            const companyPassword = await bcrypt.hash('company123', 10);
            const companyAdminResult = await db.query(`
                INSERT INTO users (email, username, password_hash, display_name, role, is_verified, is_active)
                VALUES ($1, $2, $3, $4, 'company', true, true)
                ON CONFLICT (email) DO NOTHING
                RETURNING id
            `, [
                `${company.slug}@example.com`,
                `${company.slug}_admin`,
                companyPassword,
                `${company.name} Admin`
            ]);

            if (companyAdminResult.rows[0]?.id) {
                // Create company
                await db.query(`
                    INSERT INTO companies (name, slug, description, industry, size, location, admin_id, is_verified, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
                    ON CONFLICT (slug) DO NOTHING
                `, [
                    company.name,
                    company.slug,
                    company.description,
                    company.industry,
                    company.size,
                    company.location,
                    companyAdminResult.rows[0].id
                ]);
            }
        }

        // Create sample bug bounty programs
        const tnbResult = await db.query('SELECT id FROM companies WHERE slug = $1', ['tnb']);
        if (tnbResult.rows[0]) {
            await db.query(`
                INSERT INTO programs (
                    company_id, name, slug, description, short_description, status,
                    min_reward, max_reward, critical_reward_min, critical_reward_max,
                    high_reward_min, high_reward_max, medium_reward_min, medium_reward_max,
                    low_reward_min, low_reward_max, in_scope_domains, policy
                ) VALUES (
                    $1, 'TNB Security Program', 'tnb-security', 
                    'Comprehensive security assessment of our digital banking platforms.',
                    'Secure Tanzania leading bank', 'active',
                    100, 5000, 3000, 5000, 1000, 3000, 300, 1000, 100, 300,
                    ARRAY['*.tnb.co.tz', 'mobile.tnb.co.tz', 'api.tnb.co.tz'],
                    'Please read our full security policy before testing.'
                )
                ON CONFLICT (slug) DO NOTHING
            `, [tnbResult.rows[0].id]);
        }

        const nmbResult = await db.query('SELECT id FROM companies WHERE slug = $1', ['nmb']);
        if (nmbResult.rows[0]) {
            await db.query(`
                INSERT INTO programs (
                    company_id, name, slug, description, short_description, status,
                    min_reward, max_reward, in_scope_domains
                ) VALUES (
                    $1, 'NMB Bug Bounty', 'nmb-bounty',
                    'Help us secure mobile banking for millions of Tanzanians.',
                    'Mobile banking security', 'active',
                    50, 3000, ARRAY['*.nmbbank.co.tz', 'app.nmbbank.co.tz']
                )
                ON CONFLICT (slug) DO NOTHING
            `, [nmbResult.rows[0].id]);
        }

        // Create sample hacker users
        const hackers = [
            { username: 'cyberhunter_tz', email: 'hunter1@example.com', name: 'Cyber Hunter' },
            { username: 'whitehat_dar', email: 'hunter2@example.com', name: 'White Hat Dar' },
            { username: 'netsec_mz', email: 'hunter3@example.com', name: 'NetSec MZ' }
        ];

        for (const hacker of hackers) {
            const password = await bcrypt.hash('hacker123', 10);
            await db.query(`
                INSERT INTO users (email, username, password_hash, display_name, role, is_verified, is_active, reputation, points)
                VALUES ($1, $2, $3, $4, 'hacker', true, true, ${Math.floor(Math.random() * 1000)}, ${Math.floor(Math.random() * 10000)})
                ON CONFLICT (email) DO NOTHING
            `, [hacker.email, hacker.username, password, hacker.name]);
        }

        console.log('✅ Database seeded successfully!');
        console.log('');
        console.log('Admin login:');
        console.log('  Email: admin@bongo-crowd.com');
        console.log('  Password: admin123');
        console.log('');
        console.log('Sample hacker login:');
        console.log('  Email: hunter1@example.com');
        console.log('  Password: hacker123');

    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }

    process.exit(0);
}

seed();
