# BONGO-CROWD Analytics Dashboard

A comprehensive analytics dashboard for tracking bug bounty program performance with beautiful visualizations and real-time metrics.

## Features

### Admin Analytics Dashboard
- **Platform Overview Statistics**: Total reports, bounties paid, researchers, companies
- **Submissions Over Time**: Line chart showing submission trends by severity
- **Severity Distribution**: Donut chart showing breakdown of vulnerabilities
- **Top Vulnerability Types**: Bar chart of most common vulnerability categories
- **Monthly Bounty Payouts**: Financial tracking by month
- **Response Time Metrics**: Triage and resolution time analytics
- **Top Researchers Leaderboard**: Rankings by earnings and reports
- **Company Rankings**: Bounty payouts by company

### Company Analytics Dashboard
- **Company-specific Metrics**: All reports, bounties, response times for your programs
- **Program Performance Cards**: Per-program statistics and status
- **Top Researchers**: Researchers contributing to your programs
- **Severity Breakdown**: Vulnerability distribution
- **Vulnerability Types**: Most common issues affecting your programs

### Export Functionality
- CSV export for reports, bounties, and metrics
- Company-scoped or platform-wide exports
- Date range filtering support

## Database Schema

### Materialized Views

1. **mv_platform_stats** - Aggregated platform statistics
2. **mv_daily_submissions** - Daily submission counts by severity
3. **mv_monthly_analytics** - Monthly platform metrics
4. **mv_company_analytics** - Per-company analytics
5. **mv_vulnerability_types** - Vulnerability type breakdown
6. **mv_researcher_leaderboard** - Top researchers rankings
7. **mv_response_time_metrics** - Response time analytics

### Analytics Tables

- **analytics_metrics** - Historical metric tracking with period-based aggregation

## Routes

### Admin Routes
```
GET  /admin/analytics           - Admin analytics dashboard
POST /api/analytics/refresh     - Refresh materialized views (admin only)
```

### Company Routes
```
GET /companies/:id/analytics     - Company analytics dashboard
```

### API Routes
```
GET /api/analytics/reports      - Chart data JSON API
Query params:
  - scope: 'platform' | 'company'
  - companyId: UUID (required if scope=company)
  - period: '7d' | '30d' | '90d' | '1y' | 'all'
  - type: 'all' | 'submissions' | 'severity' | 'vulnerability_types' | 'bounties' | 'response_times'

GET /api/analytics/export/csv   - Export data to CSV
Query params:
  - scope: 'platform' | 'company'
  - companyId: UUID (required if scope=company)
  - reportType: 'reports' | 'bounties' | 'metrics'
```

## Styling

The dashboard uses the **HackenProof Dark Theme**:
- Background: `#0f0f1a` (primary), `#1a1a2e` (secondary)
- Accent Purple: `#7c3aed`
- Accent Cyan: `#06b6d4`
- Glassmorphism cards with `backdrop-filter: blur(10px)`
- Chart.js integration for responsive, interactive charts

## Installation

1. Run the analytics migration:
```bash
psql -U postgres -d bongo_crowd -f database/migrations/add_analytics_schema.sql
```

2. Install dependencies (json2csv is already in package.json):
```bash
npm install
```

3. The analytics routes are automatically registered in `server.js`.

## Refreshing Analytics Data

To manually refresh materialized views:
```bash
# Via API (admin only)
curl -X POST http://localhost:3000/api/analytics/refresh

# Via PostgreSQL
SELECT refresh_analytics_views();
```

### Automated Refresh

Consider setting up a cron job or scheduled task to refresh views periodically:

```sql
-- Refresh every hour
SELECT cron.schedule('refresh-analytics', '0 * * * *', 'SELECT refresh_analytics_views()');
```

## Security

- Admin routes require `role = 'admin'`
- Company routes verify company ownership via `admin_id` or admin role
- All analytics API endpoints require authentication
- CSV exports respect scope limitations (company users can only export their data)

## Chart.js Configuration

The dashboard uses Chart.js with custom styling:
- Dark theme with transparent backgrounds
- Custom gradients for line charts
- Responsive sizing
- Custom tooltips and legends

## Future Enhancements

- PDF export functionality (using libraries like jsPDF or Puppeteer)
- Real-time WebSocket updates
- Custom date range selection
- More detailed program-level analytics
- Email reports scheduling
- Performance optimization for large datasets
