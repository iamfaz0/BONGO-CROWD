/**
 * Badge and Reputation Service
 * Handles automatic badge assignment and reputation point calculations
 */

const db = require('../config/database');

// Reputation point values
const REPUTATION_POINTS = {
    VALID_REPORT: 50,
    SEVERITY_BONUS: {
        critical: 100,
        high: 50,
        medium: 20,
        low: 10,
        info: 0
    },
    QUICK_RESPONSE: 20,
    STREAK_BONUS: 10,
    BOUNTY_BONUS_PERCENT: 0.01 // 1% of bounty amount
};

// Rank thresholds
const RANK_THRESHOLDS = {
    novice: 0,
    hunter: 500,
    expert: 2000,
    elite: 5000,
    legend: 10000
};

/**
 * Initialize or get user reputation record
 */
async function getOrCreateUserReputation(userId) {
    let result = await db.query(
        'SELECT * FROM user_reputation WHERE user_id = $1',
        [userId]
    );
    
    if (result.rows.length === 0) {
        result = await db.query(
            `INSERT INTO user_reputation (user_id, score, rank, last_activity_at)
             VALUES ($1, 0, 'novice', CURRENT_TIMESTAMP)
             RETURNING *`,
            [userId]
        );
    }
    
    return result.rows[0];
}

/**
 * Add reputation points to a user
 */
async function addReputationPoints(userId, points, actionType, referenceType = null, referenceId = null, description = '') {
    const reputation = await getOrCreateUserReputation(userId);
    const pointsBefore = reputation.score;
    const pointsAfter = pointsBefore + points;
    
    // Calculate new rank
    const newRank = calculateRank(pointsAfter);
    const oldRank = reputation.rank;
    
    // Update user_reputation table
    await db.query(
        `UPDATE user_reputation 
         SET score = $1, rank = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [pointsAfter, newRank, userId]
    );
    
    // Also update users table
    await db.query(
        `UPDATE users 
         SET reputation = $1, reputation_score = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [pointsAfter, userId]
    );
    
    // Log reputation history
    await db.query(
        `INSERT INTO reputation_history 
         (user_id, action_type, points_change, points_before, points_after, reference_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, actionType, points, pointsBefore, pointsAfter, referenceType, referenceId, description]
    );
    
    // Check for rank up
    if (newRank !== oldRank && RANK_THRESHOLDS[newRank] > RANK_THRESHOLDS[oldRank]) {
        await createNotification(
            userId,
            'rank_up',
            `Congratulations! You ranked up to ${newRank.charAt(0).toUpperCase() + newRank.slice(1)}!`,
            `/users/profile/${userId}`
        );
    }
    
    return { pointsBefore, pointsAfter, rank: newRank, rankUp: newRank !== oldRank };
}

/**
 * Calculate rank based on points
 */
function calculateRank(points) {
    if (points >= RANK_THRESHOLDS.legend) return 'legend';
    if (points >= RANK_THRESHOLDS.elite) return 'elite';
    if (points >= RANK_THRESHOLDS.expert) return 'expert';
    if (points >= RANK_THRESHOLDS.hunter) return 'hunter';
    return 'novice';
}

/**
 * Award reputation points when a report is accepted/resolved
 */
async function awardReportPoints(reportId, userId, severity, bountyAmount = null) {
    let totalPoints = REPUTATION_POINTS.VALID_REPORT;
    
    // Add severity bonus
    if (severity && REPUTATION_POINTS.SEVERITY_BONUS[severity]) {
        totalPoints += REPUTATION_POINTS.SEVERITY_BONUS[severity];
    }
    
    // Add bounty bonus (1% of bounty)
    if (bountyAmount && bountyAmount > 0) {
        totalPoints += Math.floor(bountyAmount * REPUTATION_POINTS.BOUNTY_BONUS_PERCENT);
    }
    
    // Update report counts in user_reputation
    const severityColumn = `${severity}_findings`;
    await db.query(
        `UPDATE user_reputation 
         SET valid_reports_count = valid_reports_count + 1,
             ${severityColumn} = ${severityColumn} + 1,
             total_bounties_earned = total_bounties_earned + COALESCE($1, 0),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [bountyAmount || 0, userId]
    );
    
    // Add reputation points
    const result = await addReputationPoints(
        userId,
        totalPoints,
        'report_accepted',
        'report',
        reportId,
        `Report ${reportId} accepted (${severity} severity)`
    );
    
    // Update streak
    await updateActivityStreak(userId);
    
    // Check for badges
    await checkAndAwardBadges(userId);
    
    return { points: totalPoints, ...result };
}

/**
 * Update activity streak
 */
async function updateActivityStreak(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if already logged today
    const existingResult = await db.query(
        `SELECT * FROM user_streaks 
         WHERE user_id = $1 AND streak_type = 'activity'`,
        [userId]
    );
    
    if (existingResult.rows.length === 0) {
        // Create new streak entry
        await db.query(
            `INSERT INTO user_streaks (user_id, streak_type, current_streak, longest_streak, last_activity_date, streak_start_date)
             VALUES ($1, 'activity', 1, 1, $2, $2)`,
            [userId, today]
        );
        return { streak: 1, isNew: true };
    }
    
    const streak = existingResult.rows[0];
    const lastActivity = streak.last_activity_date;
    const lastActivityDate = new Date(lastActivity).toISOString().split('T')[0];
    
    if (lastActivityDate === today) {
        // Already updated today
        return { streak: streak.current_streak, isNew: false };
    }
    
    // Check if consecutive day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let newStreak = streak.current_streak;
    let streakStart = streak.streak_start_date;
    
    if (lastActivityDate === yesterdayStr) {
        // Consecutive day, increment streak
        newStreak += 1;
    } else {
        // Streak broken, start new
        newStreak = 1;
        streakStart = today;
    }
    
    const longestStreak = Math.max(streak.longest_streak, newStreak);
    
    await db.query(
        `UPDATE user_streaks 
         SET current_streak = $1, longest_streak = $2, last_activity_date = $3, streak_start_date = $4
         WHERE user_id = $5 AND streak_type = 'activity'`,
        [newStreak, longestStreak, today, streakStart, userId]
    );
    
    // Award streak bonus if milestone reached
    if (newStreak % 7 === 0) {
        await addReputationPoints(
            userId,
            REPUTATION_POINTS.STREAK_BONUS,
            'streak_bonus',
            null,
            null,
            `${newStreak} day streak bonus!`
        );
    }
    
    return { streak: newStreak, isNew: true };
}

/**
 * Get user's badges
 */
async function getUserBadges(userId) {
    const result = await db.query(
        `SELECT b.*, ub.earned_at
         FROM user_badges ub
         JOIN badges b ON ub.badge_id = b.id
         WHERE ub.user_id = $1
         ORDER BY ub.earned_at DESC`,
        [userId]
    );
    return result.rows;
}

/**
 * Get all available badges with user progress
 */
async function getAllBadgesWithProgress(userId) {
    const allBadges = await db.query(
        `SELECT * FROM badges WHERE is_active = true ORDER BY category, rarity, name`
    );
    
    const userBadges = await db.query(
        `SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1`,
        [userId]
    );
    
    const earnedBadgeIds = new Set(userBadges.rows.map(ub => ub.badge_id));
    
    // Get user stats for progress calculation
    const userStats = await getUserBadgeStats(userId);
    
    return allBadges.rows.map(badge => {
        const earned = earnedBadgeIds.has(badge.id);
        const progress = calculateBadgeProgress(badge, userStats);
        return {
            ...badge,
            earned,
            earned_at: earned ? userBadges.rows.find(ub => ub.badge_id === badge.id)?.earned_at : null,
            progress,
            progress_percent: Math.min(100, Math.floor((progress.current / progress.required) * 100))
        };
    });
}

/**
 * Get user stats for badge calculations
 */
async function getUserBadgeStats(userId) {
    const reputation = await getOrCreateUserReputation(userId);
    
    // Get report counts by severity
    const reportStats = await db.query(
        `SELECT 
            COUNT(*) as total_reports,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
            COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
            COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
            COUNT(CASE WHEN vulnerability_type ILIKE '%api%' THEN 1 END) as api_count,
            COUNT(CASE WHEN vulnerability_type ILIKE '%web%' OR vulnerability_type ILIKE '%xss%' OR vulnerability_type ILIKE '%sql%' THEN 1 END) as web_count,
            COUNT(CASE WHEN vulnerability_type ILIKE '%mobile%' OR vulnerability_type ILIKE '%android%' OR vulnerability_type ILIKE '%ios%' THEN 1 END) as mobile_count,
            COUNT(CASE WHEN vulnerability_type ILIKE '%blockchain%' OR vulnerability_type ILIKE '%smart contract%' THEN 1 END) as blockchain_count
         FROM reports WHERE researcher_id = $1 AND status IN ('accepted', 'resolved')`,
        [userId]
    );
    
    const streakStats = await db.query(
        `SELECT * FROM user_streaks WHERE user_id = $1`,
        [userId]
    );
    
    return {
        reputation: reputation.score,
        ...reportStats.rows[0],
        streak: streakStats.rows[0]?.current_streak || 0,
        longest_streak: streakStats.rows[0]?.longest_streak || 0
    };
}

/**
 * Calculate badge progress
 */
function calculateBadgeProgress(badge, stats) {
    const criteria = badge.criteria;
    const type = criteria.type;
    const required = criteria.count || 1;
    
    let current = 0;
    
    switch (type) {
        case 'first_report':
            current = stats.total_reports > 0 ? 1 : 0;
            break;
        case 'resolved_reports':
            current = stats.resolved_count || 0;
            break;
        case 'critical_reports':
            current = stats.critical_count || 0;
            break;
        case 'reputation':
            current = stats.reputation || 0;
            break;
        case 'web_vulns':
            current = stats.web_count || 0;
            break;
        case 'api_vulns':
            current = stats.api_count || 0;
            break;
        case 'mobile_vulns':
            current = stats.mobile_count || 0;
            break;
        case 'blockchain_vulns':
            current = stats.blockchain_count || 0;
            break;
        case 'daily_streak':
        case 'activity_streak':
            current = stats.streak || 0;
            break;
        default:
            current = 0;
    }
    
    return { current, required };
}

/**
 * Check and award eligible badges
 */
async function checkAndAwardBadges(userId) {
    const stats = await getUserBadgeStats(userId);
    
    // Get all active badges user doesn't have yet
    const availableBadges = await db.query(
        `SELECT b.* FROM badges b
         WHERE b.is_active = true
         AND NOT EXISTS (
             SELECT 1 FROM user_badges ub 
             WHERE ub.badge_id = b.id AND ub.user_id = $1
         )`,
        [userId]
    );
    
    const awardedBadges = [];
    
    for (const badge of availableBadges.rows) {
        const progress = calculateBadgeProgress(badge, stats);
        
        if (progress.current >= progress.required) {
            // Award badge
            await db.query(
                `INSERT INTO user_badges (user_id, badge_id, earned_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)`,
                [userId, badge.id]
            );
            
            // Award badge points
            if (badge.points_reward > 0) {
                await addReputationPoints(
                    userId,
                    badge.points_reward,
                    'badge_earned',
                    'badge',
                    badge.id,
                    `Earned badge: ${badge.name}`
                );
            }
            
            // Create notification
            await createNotification(
                userId,
                'badge_earned',
                `🎉 You earned the "${badge.name}" badge!`,
                '/users/badges'
            );
            
            awardedBadges.push(badge);
        }
    }
    
    return awardedBadges;
}

/**
 * Award a specific badge to a user (admin function)
 */
async function awardBadge(userId, badgeId, awardedBy = null) {
    // Check if user already has badge
    const existing = await db.query(
        'SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2',
        [userId, badgeId]
    );
    
    if (existing.rows.length > 0) {
        return { success: false, message: 'User already has this badge' };
    }
    
    // Get badge details
    const badgeResult = await db.query(
        'SELECT * FROM badges WHERE id = $1',
        [badgeId]
    );
    
    if (badgeResult.rows.length === 0) {
        return { success: false, message: 'Badge not found' };
    }
    
    const badge = badgeResult.rows[0];
    
    // Award badge
    await db.query(
        `INSERT INTO user_badges (user_id, badge_id, earned_at, notification_sent)
         VALUES ($1, $2, CURRENT_TIMESTAMP, true)`,
        [userId, badgeId]
    );
    
    // Award points
    if (badge.points_reward > 0) {
        await addReputationPoints(
            userId,
            badge.points_reward,
            'badge_earned',
            'badge',
            badgeId,
            `Awarded badge: ${badge.name}${awardedBy ? ` by admin` : ''}`
        );
    }
    
    // Create notification
    await createNotification(
        userId,
        'badge_earned',
        `🎉 You received the "${badge.name}" badge!`,
        '/users/badges'
    );
    
    return { success: true, badge };
}

/**
 * Create notification
 */
async function createNotification(userId, type, message, link = null) {
    try {
        await db.query(
            `INSERT INTO notifications (user_id, type, title, content, link, is_read, created_at)
             VALUES ($1, $2, $3, $3, $4, false, CURRENT_TIMESTAMP)`,
            [userId, type, message, link]
        );
    } catch (err) {
        console.error('Failed to create notification:', err);
    }
}

/**
 * Get leaderboard with reputation ranks
 */
async function getLeaderboard(period = 'all_time', limit = 100, offset = 0) {
    let query = `
        SELECT 
            u.id,
            u.username,
            u.display_name,
            u.avatar_url,
            COALESCE(ur.score, 0) as reputation,
            COALESCE(ur.rank, 'novice') as rank,
            COALESCE(ur.valid_reports_count, 0) as valid_reports,
            COALESCE(ur.critical_findings, 0) as critical_findings,
            COALESCE(ur.high_findings, 0) as high_findings,
            COALESCE(ur.total_bounties_earned, 0) as total_earnings,
            u.points
        FROM users u
        LEFT JOIN user_reputation ur ON u.id = ur.user_id
        WHERE u.role = 'hacker' 
        AND u.is_active = true 
        AND u.is_banned = false
    `;
    
    if (period === 'month') {
        // Filter for current month activity
        query += ` AND EXISTS (
            SELECT 1 FROM reputation_history rh 
            WHERE rh.user_id = u.id 
            AND rh.created_at >= DATE_TRUNC('month', CURRENT_DATE)
        )`;
    } else if (period === 'year') {
        query += ` AND EXISTS (
            SELECT 1 FROM reputation_history rh 
            WHERE rh.user_id = u.id 
            AND rh.created_at >= DATE_TRUNC('year', CURRENT_DATE)
        )`;
    }
    
    query += ` ORDER BY reputation DESC, valid_reports DESC LIMIT $1 OFFSET $2`;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows;
}

/**
 * Get top hackers for podium display
 */
async function getTopHackers(limit = 3) {
    return await getLeaderboard('all_time', limit, 0);
}

/**
 * Get user reputation summary
 */
async function getUserReputationSummary(userId) {
    const reputation = await getOrCreateUserReputation(userId);
    const badges = await getUserBadges(userId);
    const streaks = await db.query(
        'SELECT * FROM user_streaks WHERE user_id = $1',
        [userId]
    );
    
    // Calculate next rank
    const currentRank = reputation.rank;
    const rankKeys = Object.keys(RANK_THRESHOLDS);
    const currentRankIndex = rankKeys.indexOf(currentRank);
    const nextRank = currentRankIndex < rankKeys.length - 1 ? rankKeys[currentRankIndex + 1] : null;
    const pointsToNextRank = nextRank ? RANK_THRESHOLDS[nextRank] - reputation.score : 0;
    const progressPercent = nextRank 
        ? Math.min(100, ((reputation.score - RANK_THRESHOLDS[currentRank]) / 
            (RANK_THRESHOLDS[nextRank] - RANK_THRESHOLDS[currentRank])) * 100)
        : 100;
    
    return {
        ...reputation,
        badges: badges.length,
        badges_list: badges,
        streaks: streaks.rows,
        next_rank: nextRank,
        points_to_next_rank: Math.max(0, pointsToNextRank),
        rank_progress_percent: progressPercent,
        rank_thresholds: RANK_THRESHOLDS
    };
}

module.exports = {
    // Reputation
    addReputationPoints,
    getOrCreateUserReputation,
    getUserReputationSummary,
    calculateRank,
    RANK_THRESHOLDS,
    REPUTATION_POINTS,
    
    // Report Points
    awardReportPoints,
    
    // Badges
    getUserBadges,
    getAllBadgesWithProgress,
    checkAndAwardBadges,
    awardBadge,
    
    // Leaderboard
    getLeaderboard,
    getTopHackers,
    
    // Streaks
    updateActivityStreak
};
