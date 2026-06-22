# Bounty Calculator & Severity Matrix - Implementation Summary

## Overview
An interactive bounty calculator for the BONGO-CROWD bug bounty platform that allows hackers to estimate rewards based on CVSS scores and severity levels.

## Database Schema

### Tables Created

1. **severity_matrix**
   - `id` (UUID, Primary Key)
   - `severity` (VARCHAR): critical, high, medium, low, info
   - `cvss_min`, `cvss_max` (DECIMAL): CVSS score range
   - `min_bounty`, `max_bounty` (DECIMAL): Bounty range
   - `description` (TEXT): Detailed description
   - `color` (VARCHAR): Display color
   - `icon` (VARCHAR): Emoji/icon
   - `is_active` (BOOLEAN)
   - `created_at`, `updated_at` (TIMESTAMP)

2. **bounty_calculation_logs**
   - `id` (UUID, Primary Key)
   - `user_id` (UUID, Foreign Key): User who made calculation
   - `program_id` (UUID, Foreign Key): Target program
   - `cvss_score` (DECIMAL): Input CVSS score
   - `severity` (VARCHAR): Calculated severity
   - `calculated_bounty` (DECIMAL): Estimated amount
   - `min_bounty`, `max_bounty` (DECIMAL): Range
   - `impact_confidentiality`, `impact_integrity`, `impact_availability` (VARCHAR): CIA triad
   - `scope` (VARCHAR): Scope changed/unchanged
   - `user_agent`, `ip_address`: Request metadata
   - `created_at` (TIMESTAMP)

3. **program_bounty_ranges**
   - `id` (UUID, Primary Key)
   - `program_id` (UUID, Foreign Key)
   - `severity` (VARCHAR)
   - `min_bounty`, `max_bounty` (DECIMAL)
   - `is_active` (BOOLEAN)

### Functions Created

1. **get_severity_from_cvss(cvss DECIMAL)** - Returns severity based on CVSS score
2. **get_bounty_range(program_id UUID, severity VARCHAR)** - Returns bounty range for program

## Default Severity Matrix

| Severity | CVSS Range | Min Bounty | Max Bounty | Icon |
|----------|------------|------------|------------|------|
| Critical | 9.0 - 10.0 | $5,000     | $20,000    | 💀   |
| High     | 7.0 - 8.9  | $1,000     | $5,000     | 🔥   |
| Medium   | 4.0 - 6.9  | $250       | $1,000     | ⚡   |
| Low      | 0.1 - 3.9  | $50        | $250       | 📝   |
| Info     | 0.0        | $0         | $0         | ℹ️   |

## Routes

### Page Routes
- **GET /tools/bounty-calculator** - Interactive bounty calculator page

### API Routes
- **GET /api/severity-matrix** - Returns severity matrix data
- **POST /api/calculate-bounty** - Calculate bounty based on CVSS and impact
  - Parameters: `cvss_score`, `program_id` (optional), `impact_*`, `scope`
- **GET /api/programs/:id/bounty-ranges** - Get program-specific bounty ranges

## Features

### Bounty Calculator Page (/tools/bounty-calculator)

1. **Interactive CVSS Slider** (0-10)
   - Color-coded gradient (green → yellow → orange → red)
   - Animated thumb with glow effect

2. **Severity Auto-Detection**
   - Automatically detects severity based on CVSS score
   - Visual indicator with color-coded badge
   - Icon and name display

3. **Impact Assessment (CIA Triad)**
   - Confidentiality: None / Low / High
   - Integrity: None / Low / High
   - Availability: None / Low / High
   - Real-time CVSS calculation based on selections

4. **Scope Selection**
   - Unchanged (Scope: U) - Lock icon 🔒
   - Changed (Scope: C) - Globe icon 🌐

5. **Program-Specific Bounty Ranges**
   - Dropdown to select target program
   - Displays program-specific bounty ranges if configured
   - Falls back to global matrix if not configured

6. **Real-Time Bounty Estimate**
   - Animated display with shimmer effect
   - Shows estimated amount (midpoint of range)
   - Shows full bounty range
   - For Info severity: Shows "Swag/Points"

7. **CVSS Vector String**
   - Auto-generated based on selections
   - Copy to clipboard button

8. **Severity Matrix Table**
   - Displays all severity levels
   - Highlights active row based on selection

9. **HackenProof Dark Theme**
   - Glassmorphism cards
   - Purple/cyan gradient accents
   - Responsive design

### Report Submission Integration

1. **Bounty Estimate Widget**
   - Embedded in report submission form
   - Displays when severity is selected
   - Shows estimated bounty based on selected program and severity
   - Link to full bounty calculator

2. **Program Data Attributes**
   - Programs now include per-severity bounty ranges
   - Falls back to global matrix if not specified

## File Structure

```
bongo-crowd/
├── database/
│   └── migrations/
│       └── create_bounty_tables.sql    # Database schema
├── routes/
│   ├── tools.js                         # Tools routes
│   ├── api.js                          # API endpoints (modified)
│   └── reports.js                      # Reports routes (modified)
├── views/
│   ├── tools/
│   │   └── bounty-calculator.ejs       # Calculator page
│   └── reports/
│       └── submit.ejs                  # Submission form (modified)
└── server.js                           # App entry (modified)
```

## Installation

1. Run the database migration:
```bash
sudo -u postgres psql -d bongocrowd -f database/migrations/create_bounty_tables.sql
```

2. Restart the server to load new routes.

## Usage

### For Hackers
1. Visit `/tools/bounty-calculator`
2. Adjust CVSS slider or select impact values
3. Optionally select target program for specific ranges
4. View estimated bounty
5. Copy CVSS vector for report submission

### During Report Submission
1. Select target program
2. Choose vulnerability severity
3. View estimated bounty in real-time
4. Click "Use Bounty Calculator" for detailed estimate

### For Program Admins
Configure program-specific bounty ranges in `program_bounty_ranges` table or via admin interface.

## Security Considerations

- Calculation logs store IP and user agent for analytics
- User ID is only logged if authenticated
- No sensitive data exposed in API responses

## Future Enhancements

- Admin interface for managing severity matrix
- CVSS 4.0 support
- Historical bounty data analysis
- Machine learning for bounty prediction
- Integration with report triage workflow