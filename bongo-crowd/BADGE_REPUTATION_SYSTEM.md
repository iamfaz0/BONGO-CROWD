# BONGO-CROWD Badge and Reputation System

## Overview
A comprehensive gamification system that rewards hackers with badges, reputation points, and ranks based on their contributions to the platform.

## Database Schema

### Tables Created

1. **badges** - Stores all available badges
   - id, name, description, icon, criteria (JSON), category, rarity, points_reward, color, gradient_start, gradient_end, is_active

2. **user_badges** - Links users to earned badges (many-to-many)
   - id, user_id, badge_id, earned_at, notification_sent

3. **user_reputation** - Detailed reputation tracking per user
   - id, user_id, score, rank, streak_current, streak_longest, valid_reports_count, critical_findings, high_findings, etc.

4. **reputation_history** - Audit trail of all reputation changes
   - id, user_id, action_type, points_change, points_before, points_after, reference_type, reference_id, description

5. **user_streaks** - Activity streak tracking
   - id, user_id, streak_type, current_streak, longest_streak, last_activity_date, streak_start_date

### Migration File
- `/database/migrations/add_badge_reputation_system.sql`

## Routes Created

### User Routes
- `GET /users/badges` - View all badges and user's badges with progress

### API Routes
- `GET /api/users/:id/reputation` - Get user reputation data (public)
- `POST /api/badges/check` - Trigger badge check (for testing)

### Admin Routes
- `GET /admin/badges` - List all badges
- `GET /admin/badges/create` - Create badge form
- `POST /admin/badges/create` - Create new badge
- `GET /admin/badges/:id/edit` - Edit badge form
- `POST /admin/badges/:id/edit` - Update badge
- `POST /admin/badges/:id/delete` - Delete/deactivate badge
- `POST /admin/badges/:id/award` - Award badge to user
- `GET /admin/users/:id/award-badge` - Show award badge form

## Views Created

1. **users/badges.ejs** - User badge showcase page with:
   - Reputation card with rank and progress
   - Badge categories (Skill, Achievement, Activity, Special)
   - Progress bars for unearned badges
   - Recent activity history

2. **admin/badges.ejs** - Admin badge management

3. **admin/badge-form.ejs** - Create/Edit badge form with live preview

4. **admin/award-badge.ejs** - Award badge to specific user

## Views Updated

1. **users/profile.ejs** - Enhanced with:
   - Rank indicator on avatar
   - Rank tag in stats
   - Rank progress bar
   - Featured badges display
   - View All Badges link

2. **leaderboard.ejs** - Enhanced with:
   - Rank tags for each user
   - Podium rank labels
   - Reputation-based sorting

3. **layout.ejs** - Added:
   - Badges CSS link
   - Navigation link to Badges & Reputation

## Service Layer

### `/services/badgeService.js`

Core functions:
- `addReputationPoints()` - Add points with audit trail
- `awardReportPoints()` - Award points when reports accepted
- `getUserReputationSummary()` - Get full reputation data
- `getUserBadges()` - Get user's earned badges
- `getAllBadgesWithProgress()` - Get all badges with progress calculation
- `checkAndAwardBadges()` - Check and award eligible badges
- `awardBadge()` - Manually award badge (admin)
- `getLeaderboard()` - Get ranked leaderboard
- `updateActivityStreak()` - Update daily streak

## Reputation System

### Point Values
- Valid Report: +50 points
- Severity Bonus:
  - Critical: +100
  - High: +50
  - Medium: +20
  - Low: +10
- Quick Response: +20
- Bounty Bonus: 1% of bounty amount
- Streak Bonus: +10 per 7-day streak

### Ranks
1. **Novice** (0 points) - 🌱
2. **Hunter** (500 points) - 🔥
3. **Expert** (2,000 points) - 🎯
4. **Elite** (5,000 points) - 💎
5. **Legend** (10,000 points) - 👑

## Default Badges

### Skill Badges
- **Web Hacker** - Found 10+ valid web vulnerabilities (Rare, +100 pts)
- **API Hunter** - Found 5+ valid API vulnerabilities (Rare, +150 pts)
- **Mobile Expert** - Found 3+ valid mobile vulnerabilities (Epic, +200 pts)
- **Blockchain Pro** - Found 2+ valid smart contract vulnerabilities (Legendary, +500 pts)

### Achievement Badges
- **First Blood** - First valid report (Common, +50 pts)
- **Bug Squasher** - 10 resolved reports (Rare, +100 pts)
- **Critical Hunter** - 5 critical vulnerabilities (Epic, +300 pts)
- **Elite Hunter** - 5,000 reputation points (Legendary, +1000 pts)
- **Hall of Fame** - Top 10 monthly leaderboard (Epic, +250 pts)

### Activity Badges
- **Consistent Reporter** - 7-day streak (Rare, +75 pts)
- **Quick Responder** - 10 quick responses (Rare, +50 pts)
- **Rising Star** - 5 reports in first month (Common, +25 pts)
- **Dedicated Hunter** - 30-day streak (Epic, +200 pts)

### Special Badges
- **Bug Bounty Pioneer** - Beta user (Legendary, +500 pts)
- **Community Helper** - Helped 5+ researchers (Rare, +100 pts)
- **Perfect Report** - CVSS 10.0 report (Epic, +400 pts)

## CSS Features

### Animations
- Badge unlock animation (scale, rotate, blur)
- Badge glow effect (pulsing shadow)
- Badge shine effect (shimmer overlay)
- Rank progress bar animation
- Floating badge effect on hover

### Visual Styles
- Rarity-based color schemes (Common, Rare, Epic, Legendary)
- Rank-based color schemes (Novice to Legend)
- Dark theme compatible
- Reduced motion support

## File Structure

```
bongo-crowd/
├── database/
│   └── migrations/
│       └── add_badge_reputation_system.sql
├── services/
│   └── badgeService.js
├── routes/
│   ├── badges.js (new)
│   ├── users.js (updated)
│   ├── index.js (updated)
│   └── server.js (updated)
├── views/
│   ├── users/
│   │   ├── badges.ejs (new)
│   │   └── profile.ejs (updated)
│   ├── admin/
│   │   ├── badges.ejs (new)
│   │   ├── badge-form.ejs (new)
│   │   └── award-badge.ejs (new)
│   ├── leaderboard.ejs (updated)
│   └── layout.ejs (updated)
└── public/
    └── css/
        └── badges.css (new)
```

## Integration Points

### Automatic Badge Assignment
Call `badgeService.checkAndAwardBadges(userId)` after:
- Report accepted/resolved
- User profile updates
- Any significant user action

### Report Acceptance Hook
Update your report approval workflow to call:
```javascript
await badgeService.awardReportPoints(reportId, userId, severity, bountyAmount);
```

### Manual Badge Award
Admins can award badges via:
- `/admin/badges` → Click "Award" button
- `/admin/users/:id/award-badge` → Select badge

## API Response Examples

### GET /api/users/:id/reputation
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "username": "..." },
    "reputation": {
      "score": 2500,
      "rank": "expert",
      "next_rank": "elite",
      "points_to_next_rank": 2500,
      "progress_percent": 50
    },
    "badges": [...],
    "recent_activity": [...]
  }
}
```

## Next Steps

1. Run the migration: `psql -d bongo_crowd -f database/migrations/add_badge_reputation_system.sql`
2. Restart the server
3. Navigate to `/users/badges` to see the system in action
4. Admins can create custom badges at `/admin/badges/create`
