# 🧪 WorkforceOS Full E2E Testing Guide

## 🎯 Quick Start - No Signup Required!

### Option 1: Instant Demo Access (Recommended)
**Access the pre-populated demo workspace immediately:**

1. **Open the app** in your browser (click the webview/browser panel in Replit)
2. **Click "View Demo"** button in the top navigation
   - Or directly visit: `[Your URL]/api/demo-login`
3. **You're in!** - Instant access to fully populated workspace with:
   - ✅ 5 sample employees (different roles and rates)
   - ✅ 3 clients (TechCorp, Healthcare Plus, Retail Solutions)
   - ✅ 10 scheduled shifts (past and upcoming)
   - ✅ 5 completed time entries
   - ✅ 2 sample invoices (1 paid, 1 sent)
   - ✅ Pre-configured workspace settings

**Demo Workspace Details:**
- **Company**: Acme Services Inc.
- **Owner**: Demo User (demo@shiftsync.app)
- **Tier**: Professional (all features unlocked)
- **Resets**: Every 24 hours for fresh testing

---

### Option 2: Create Your Own Workspace
**For permanent testing with your own data:**

1. **Click "Get Started Free"** or "Login" on landing page
2. **Authenticate** via Replit using:
   - Google account
   - GitHub account
   - Facebook account
   - Email (magic link)
3. **Create workspace** - You automatically become Owner with full admin access
4. **Add your data** - Employees, clients, shifts, etc.

---

## 🧭 Complete Feature Testing Walkthrough

### 1. **Dashboard** (`/dashboard`)
**What to test:**
- ✅ Real-time analytics widgets
- ✅ Revenue tracking (post-platform-fee)
- ✅ Active employee/client counts
- ✅ Total hours worked
- ✅ Invoice statistics

**Test scenario:** View workspace overview and key metrics

---

### 2. **Advanced Schedule** (`/schedule`) ⭐ **HERO FEATURE**
**What to test:**
- ✅ Sling-style weekly grid (Sunday-Saturday)
- ✅ Employee rows with color-coded shifts
- ✅ Week statistics (total hours, labor cost, billable shifts)
- ✅ **Drag-and-drop shifts** between employees/dates
- ✅ Week navigation (previous/next buttons)
- ✅ Bulk actions:
  - Copy entire week forward
  - Generate invoices from shifts
- ✅ Create new shifts (employee, client, date, time)
- ✅ Quick actions menu (duplicate shift, delete)
- ✅ Conflict detection (overlapping shifts show red warning)
- ✅ Client assignment (color-coded by client)

**Test scenario:**
1. Navigate to `/schedule`
2. Drag a shift from one employee to another
3. Click "Create Shift" and add a new shift
4. Use "Bulk Actions" → "Copy Week Forward"
5. Click on a shift's menu (⋮) → Duplicate to next day

---

### 3. **Time Tracking** (`/time-tracking`)
**What to test:**
- ✅ Clock in/out functionality
- ✅ Real-time timer with live updates
- ✅ Automatic hourly rate calculation
- ✅ Link time entries to scheduled shifts
- ✅ Server-side total hours/amount calculation
- ✅ GPS location capture (database ready)
- ✅ Filter by employee/client
- ✅ View completed vs. active entries

**Test scenario:**
1. Navigate to `/time-tracking`
2. Click "Clock In" for an employee
3. Watch real-time timer count
4. Click "Clock Out" - see automatic calculation
5. View time entry details

---

### 4. **Employees** (`/employees`)
**What to test:**
- ✅ CRUD operations (Create, Read, Update, Delete)
- ✅ Employee cards with role and hourly rate
- ✅ Active/inactive status toggle
- ✅ Search and filter employees
- ✅ Color assignment for schedule visualization
- ✅ Role-based access control (Owner, Manager, Employee)

**Test scenario:**
1. Navigate to `/employees`
2. Click "Add Employee"
3. Fill in details (name, email, role, hourly rate)
4. View employee card with all info
5. Edit or deactivate employee

---

### 5. **Clients** (`/clients`)
**What to test:**
- ✅ Client management (CRUD operations)
- ✅ Company information tracking
- ✅ Contact details (email, phone)
- ✅ Active/inactive status
- ✅ Client assignment to shifts
- ✅ Invoice generation per client

**Test scenario:**
1. Navigate to `/clients`
2. Add new client with company info
3. Assign client to a shift in schedule
4. Generate invoice for that client's work

---

### 6. **Invoice Generation** (`/invoices`)
**What to test:**
- ✅ Automated invoice creation from time entries
- ✅ Multi-client selection
- ✅ Auto-calculates: hours × hourly rates
- ✅ Tax calculation (8.5% default)
- ✅ Platform fee calculation (10%)
- ✅ Status tracking (draft → sent → paid)
- ✅ Invoice line items breakdown
- ✅ Professional invoice number generation

**Test scenario:**
1. Navigate to `/invoices`
2. Click "Create Invoice"
3. Select client and unbilled time entries
4. Set tax rate
5. Review auto-calculated totals
6. Mark invoice as "sent" or "paid"

---

### 7. **RMS (Report Management System)** (`/reports`)
**What to test:**
- ✅ Industry-specific templates (Security, Healthcare, Construction, etc.)
- ✅ Dynamic form submissions
- ✅ **Photo requirements** (1-10 photos with timestamping)
- ✅ Supervisor approval workflows
- ✅ Template management
- ✅ Report status tracking (submitted → reviewed → approved)

**Test scenario:**
1. Navigate to `/reports`
2. Select "Daily Activity Report (DAR)" template
3. Fill out form fields
4. Upload 1-5 photos (clear, well-lighted)
5. Submit report
6. Manager reviews and approves

**Photo-Required Templates:**
- Daily Activity Report (DAR): 1-5 photos
- Security Incident Report: 2-10 photos
- Healthcare Incident Report: 1-8 photos
- Construction Safety Checklist: 2-10 photos
- General Incident Report: 1-10 photos

---

### 8. **Analytics Dashboard** (`/analytics`)
**What to test:**
- ✅ Total revenue (post-platform-fee)
- ✅ Total hours worked across workspace
- ✅ Active employee count
- ✅ Active client count
- ✅ Workspace usage metrics
- ✅ Invoice statistics breakdown

**Test scenario:** View comprehensive workspace analytics

---

### 9. **Settings** (`/settings`)
**What to test:**
- ✅ Workspace configuration
- ✅ Business category selection (10 industries)
- ✅ Form template auto-seeding based on industry
- ✅ Subscription tier info
- ✅ Platform fee percentage
- ✅ Manager assignments (RBAC)

**Test scenario:**
1. Navigate to `/settings`
2. Select business category (e.g., "Security")
3. See industry-specific templates auto-populate
4. Assign managers to employees (hierarchy)

---

### 10. **Admin Support Dashboard** (`/admin/support`)
**Who can access:** Platform administrators (root/sysop roles)

**What to test:**
- ✅ Global customer search across all workspaces
- ✅ Workspace inspector:
  - Billing tab (subscription, usage, fees)
  - Users tab (employees, roles)
  - Activity tab (recent actions)
- ✅ Business category display
- ✅ Template count (installed vs. available)
- ✅ Stripe diagnostics
- ✅ Password reset tools
- ✅ Role management
- ✅ Support ticket integration

**Test scenario:**
1. Navigate to `/admin/support`
2. Search for a workspace by name
3. View billing details
4. Check installed templates

---

### 11. **Admin Usage Dashboard** (`/admin/usage`)
**What to test:**
- ✅ Platform cost tracking
- ✅ Credit balance monitoring
- ✅ Operational cost breakdown
- ✅ Profit margin analysis
- ✅ Runway projections
- ✅ Low-balance alerts

**Test scenario:** Monitor platform operational costs

---

### 12. **Employee Onboarding** (`/onboarding`)
**What to test:**
- ✅ Email invitation workflow with secure tokens
- ✅ Multi-step onboarding flow:
  - Personal information
  - Tax classification (W-4/W-9)
  - Work availability
  - Document upload
  - E-signature capture
- ✅ Legal compliance tracking
- ✅ SOP acknowledgements
- ✅ Automatic employee number generation

**Test scenario:**
1. From `/employees`, send invitation
2. Recipient follows unique link
3. Complete all onboarding steps
4. Upload ID and sign contract

---

## 🎭 Testing Different User Roles

### Owner Role (Full Admin Access)
**Can access everything:**
- ✅ All CRUD operations
- ✅ Workspace settings
- ✅ Billing and subscription
- ✅ Manager assignments
- ✅ Employee onboarding

**How to test:** Use demo workspace (auto-Owner)

---

### Manager Role (Team Management)
**Can access:**
- ✅ Create/edit shifts for assigned employees
- ✅ Approve time entries
- ✅ Review RMS reports
- ✅ View analytics for their team
- ✅ Cannot modify workspace settings

**How to test:** Assign manager role in settings, test permissions

---

### Employee Role (Limited Access)
**Can access:**
- ✅ Clock in/out
- ✅ View own schedule
- ✅ Submit RMS reports
- ✅ Acknowledge shift orders
- ✅ Cannot create shifts or manage others

**How to test:** Create employee account, verify restrictions

---

## 🚀 Advanced Features to Explore

### Shift Orders/Post Orders (Database Ready)
**Status:** Schema complete, UI pending
- Special instructions attached to shifts
- Employee acknowledgment required before clock-in
- Priority levels: normal, high, urgent
- Management chain task assignment

### Photo Requirements (RMS)
**Status:** Schema complete, upload UI pending
- Templates require 1-10 photos
- Automatic timestamping
- Quality instructions (clear, well-lighted)
- Customer transparency compliance

---

## 📊 Expected Demo Data

When you access the demo workspace, you'll find:

### Employees (5)
1. **Sarah Johnson** - Lead Technician ($75/hr)
2. **Michael Chen** - Senior Consultant ($85/hr)
3. **Emma Williams** - Field Specialist ($65/hr)
4. **James Davis** - Technician ($60/hr)
5. **Lisa Martinez** - Consultant ($70/hr)

### Clients (3)
1. **TechCorp** - Robert Anderson
2. **Healthcare Plus** - Jennifer Thompson
3. **Retail Solutions** - David Miller

### Shifts (10)
- 5 completed (past week)
- 5 scheduled (upcoming)
- Mix of different employees and clients

### Time Entries (5)
- All linked to completed shifts
- Calculated hours and amounts
- Some billed, some unbilled

### Invoices (2)
- **INV-DEMO-001**: TechCorp - $651.00 (PAID)
- **INV-DEMO-002**: Healthcare Plus - $721.53 (SENT)

---

## 🔐 Authentication Notes

**Important:** WorkforceOS uses **Replit Auth (OAuth)** - NO traditional usernames/passwords exist!

**Login Methods:**
- Google OAuth
- GitHub OAuth
- Facebook OAuth
- Email magic link

**Auto-Admin:** When you create a workspace, you automatically become the Owner with full admin privileges.

**Demo Access:** No login required - instant access via `/api/demo-login`

---

## 🎥 Marketing Screenshot Checklist

### Must-Capture Scenes:
- [ ] **Schedule Grid** - Sling-style weekly view with shifts
- [ ] **Drag-and-Drop** - Moving shift between employees
- [ ] **Week Statistics** - Hours, labor cost, billable shifts
- [ ] **Time Tracking** - Real-time clock-in timer
- [ ] **Invoice Generation** - Automated billing interface
- [ ] **RMS Reports** - Industry-specific templates
- [ ] **Analytics Dashboard** - Revenue and metrics
- [ ] **Employee Management** - Team roster cards
- [ ] **Mobile Responsive** - Dark theme on mobile

---

## 🐛 Troubleshooting

### Issue: Can't access demo
**Solution:** Visit `/api/demo-login` directly - it auto-creates demo workspace

### Issue: No data showing
**Solution:** Demo resets every 24 hours - data may have been cleared

### Issue: Permission denied
**Solution:** Check your role - some features require Owner/Manager access

### Issue: Login not working
**Solution:** Use Replit Auth (Google/GitHub/etc.) - no username/password exists

---

## 📞 Next Steps

1. **Test the demo:** Visit `/api/demo-login`
2. **Explore features:** Use this guide to test each section
3. **Create workspace:** Build your own with real data
4. **Review admin tools:** Check support and usage dashboards

**Need marketing assets?** See `docs/MARKETING_ASSETS_GUIDE.md` for screenshot/video instructions!
