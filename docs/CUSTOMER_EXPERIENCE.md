# WorkforceOS Customer Experience Guide

## 🎯 Overview

This document explains what different users see when they login to WorkforceOS and how the support system works for Fortune 500-quality customer service.

---

## 🔐 Who Can Login?

### 1. **Workspace Owners/Subscribers** (Your Paying Customers)
**Login Method:** Replit Auth (Google, GitHub, Facebook, Email)

**What They See:**
- Full workspace dashboard
- Employee management
- Client management  
- Schedule (drag-and-drop shifts)
- Time tracking
- Invoice generation
- RMS (Report Management System)
- Analytics
- Settings
- **Customer Support Portal** ← NEW!

**Access Level:** Full control of their own workspace data (multi-tenant isolated)

---

### 2. **Managers** (Assigned by Workspace Owner)
**Login Method:** Replit Auth

**What They See:**
- Dashboard (team metrics only)
- Employee management (assigned team only)
- Schedule (can create/edit shifts for their team)
- Time tracking (approve entries for their team)
- RMS reports (review submissions from their team)
- **Customer Support Portal** (submit tickets for their workspace)

**Access Level:** Limited to assigned employees and team data

---

### 3. **Employees** (Invited via Onboarding)
**Login Method:** Replit Auth (via invitation link)

**What They See:**
- Personal dashboard
- Their own schedule (view only)
- Time tracking (clock in/out for their shifts)
- RMS reports (submit reports for their work)
- **Customer Support Portal** (get help with their account)

**Access Level:** Own data only, cannot see other employees

---

### 4. **Your Support Staff** (National Support Team)
**Login Method:** Replit Auth

**What They See:**
- **Support Team Dashboard** at `/admin/support-queue`
- Global ticket queue across all workspaces
- Customer search and workspace inspector
- Ticket assignment and routing
- SLA tracking and priority management
- Knowledge base tools
- Resolution tracking

**Access Level:** Can view customer workspaces to provide support, but cannot modify customer data directly

---

### 5. **Platform Admins** (Root/Sysop - You)
**Login Method:** Replit Auth

**What They See:**
- Everything above, plus:
- Admin Support Dashboard (`/admin/support`)
- Admin Usage Dashboard (`/admin/usage`)
- Platform revenue tracking
- All workspace management
- Feature flag control
- System audit logs

**Access Level:** Full platform access

---

## 🎫 Support Ticket System

### How Customers Get Support

#### **For Workspace Owners/Managers/Employees:**

1. **Access Support Portal:**
   - Navigate to `/support` in their dashboard
   - OR click "Get Help" in main navigation

2. **Submit Ticket:**
   - Choose ticket type:
     - General Support
     - Report Request
     - Template Request
     - Billing Question
     - Technical Issue
     - Other
   - Set priority: Low, Normal, High, Urgent
   - Provide subject and detailed description
   - Submit

3. **Track Status:**
   - View all their workspace tickets
   - Filter by status: Open, In Progress, Resolved, Closed
   - See ticket number, priority, and assigned support staff
   - Receive updates and responses

4. **Alternative Support Channels:**
   - Email: support@coaileague.com
   - Phone: 1-800-WORKFORCE (Mon-Fri 9AM-6PM EST)
   - Live Chat: Enterprise plans only

---

### How Your Support Staff Helps Nationally

#### **Support Team Dashboard** (`/admin/support-queue`)

**Features:**
- **Global Ticket Queue:**
  - View all tickets across all customer workspaces
  - Filter by: Priority, Status, Workspace, Assigned Staff
  - Sort by: Created Date, SLA Deadline, Priority

- **Ticket Assignment:**
  - Auto-routing based on ticket type and workload
  - Manual assignment to specific support staff
  - Round-robin distribution for fair workload
  - Escalation for urgent/high-priority tickets

- **Workspace Context:**
  - View customer's workspace details
  - See subscription tier and features
  - Check billing status
  - Review recent activity
  - Access customer data (read-only for support context)

- **SLA Tracking:**
  - Response time targets by priority:
    - Urgent: 1 hour response
    - High: 4 hour response
    - Normal: 24 hour response
    - Low: 48 hour response
  - Automatic alerts for SLA breaches
  - Performance metrics per support staff

- **Collaboration Tools:**
  - Internal notes (hidden from customer)
  - Tag other support staff
  - Escalate to supervisors
  - Share solutions and best practices

- **Resolution:**
  - Mark ticket as resolved with solution notes
  - Customer can reopen if issue persists
  - Auto-close after 7 days of no activity
  - Track resolution time and CSAT scores

---

## 📊 Customer Portal vs Admin Portal

### **Customer Support Portal** (`/support`)
**Who:** Workspace Owners, Managers, Employees  
**Purpose:** Submit tickets, get help, track support requests  
**Access:** Any authenticated user in a workspace

**Features:**
- ✅ Submit new support tickets
- ✅ View their workspace tickets only
- ✅ Track ticket status
- ✅ View support contact info
- ✅ Access knowledge base (future)
- ❌ Cannot see other workspace tickets
- ❌ Cannot assign tickets
- ❌ Cannot view internal notes

---

### **Support Team Dashboard** (`/admin/support-queue`)
**Who:** Your national support staff  
**Purpose:** Manage all customer tickets across all workspaces  
**Access:** Requires support staff role

**Features:**
- ✅ View ALL tickets across ALL workspaces
- ✅ Assign tickets to support staff
- ✅ Add internal notes (hidden from customers)
- ✅ Access customer workspace details
- ✅ Track SLA and performance metrics
- ✅ Collaborate with other support staff
- ✅ Escalate urgent issues
- ✅ View customer billing and subscription status
- ❌ Cannot modify customer workspace data directly

---

### **Admin Support Dashboard** (`/admin/support`)
**Who:** Platform admins (root/sysop)  
**Purpose:** Full workspace management and diagnostics  
**Access:** Requires admin role

**Features:**
- ✅ Everything in Support Team Dashboard, plus:
- ✅ Modify customer workspace data
- ✅ Reset passwords
- ✅ Change roles
- ✅ View all audit logs
- ✅ Stripe diagnostics
- ✅ Feature flag control
- ✅ Platform usage monitoring

---

## 🌍 How National Support Works

### **Ticket Routing System:**

1. **Customer submits ticket** → System creates ticket with workspace context

2. **Auto-routing logic:**
   - Urgent/High priority → Immediately notify available support staff
   - Normal priority → Round-robin assignment to team
   - Billing questions → Route to billing specialist
   - Technical issues → Route to technical support
   - Report requests → Route to RMS specialist

3. **Support staff receives notification** → Opens Support Team Dashboard

4. **Staff views ticket with full context:**
   - Customer workspace details
   - Subscription tier and features enabled
   - Recent activity and usage patterns
   - Billing status
   - Related tickets

5. **Staff resolves issue:**
   - Responds directly in ticket
   - Adds internal notes for team
   - Updates status as work progresses
   - Marks resolved when complete

6. **Customer sees resolution** → Can reopen if needed

---

## 🔒 Data Security & Privacy

### Multi-Tenant Isolation:
- Each workspace is completely isolated
- Customers only see their own data
- Support staff can VIEW customer data for context
- Support staff CANNOT modify customer data (read-only access)
- Only platform admins can modify customer workspaces

### Audit Trail:
- All support actions are logged
- Customer can see who accessed their workspace
- Support staff actions tracked for quality assurance
- Compliance with SOC2 and GDPR requirements

---

## 📈 Support Metrics & Quality

### Support Team Performance:
- **First Response Time:** Average time to first reply
- **Resolution Time:** Average time to close tickets
- **Customer Satisfaction (CSAT):** Rating after ticket closure
- **SLA Compliance:** % of tickets meeting SLA targets
- **Ticket Volume:** Tickets per support staff
- **Escalation Rate:** % of tickets escalated

### Customer Experience Metrics:
- **Self-Service Rate:** % of issues resolved via knowledge base
- **Reopen Rate:** % of tickets reopened after resolution
- **Channel Preference:** Email vs Phone vs Chat usage
- **Time to Value:** How quickly customers get help

---

## 🚀 Quick Setup for Your Support Team

### Step 1: Create Support Staff Accounts
1. Add users via Admin Support Dashboard
2. Assign "Support Staff" role
3. Set specialization (Technical, Billing, RMS, General)

### Step 2: Configure Routing Rules
1. Define auto-routing logic by ticket type
2. Set SLA targets by priority
3. Configure escalation thresholds

### Step 3: Train Support Staff
1. Give access to Support Team Dashboard (`/admin/support-queue`)
2. Show workspace context features
3. Practice ticket assignment and resolution
4. Review internal note usage for collaboration

### Step 4: Monitor Performance
1. Track SLA compliance
2. Review CSAT scores
3. Optimize routing rules
4. Scale team based on volume

---

## 🎯 What Makes This Fortune 500 Quality

### 1. **Multi-Channel Support:**
- Tickets (async)
- Email (async)
- Phone (sync)
- Live Chat (Enterprise - sync)
- Knowledge Base (self-service)

### 2. **SLA Guarantees:**
- Tiered response times
- Automatic escalation
- Performance tracking
- Contractual commitments

### 3. **National Support Coverage:**
- Distributed team across time zones
- Follow-the-sun support
- Round-robin assignment
- Load balancing

### 4. **Customer Context:**
- Workspace details at support staff fingertips
- Subscription tier and features
- Billing status
- Recent activity
- Related tickets

### 5. **Quality Assurance:**
- All interactions logged
- CSAT surveys
- Performance reviews
- Continuous improvement

### 6. **Security & Compliance:**
- Multi-tenant isolation
- Read-only support access
- Full audit trail
- SOC2/GDPR compliant

---

## 📞 Support Contact Info

### For Customers:
- **Support Portal:** `/support` (in-app)
- **Email:** support@coaileague.com
- **Phone:** 1-800-WORKFORCE (Mon-Fri 9AM-6PM EST)
- **Live Chat:** Enterprise plans (in-app)

### For Support Staff:
- **Support Queue:** `/admin/support-queue`
- **Team Slack:** #support-team (for collaboration)
- **Escalation:** #support-escalation (for urgent issues)
- **Knowledge Base:** `/admin/knowledge-base`

---

## 🔄 Customer Journey

```
Customer Signup
    ↓
Login via Replit Auth
    ↓
See Full Workspace Dashboard
    ↓
[Need Help?]
    ↓
Click "Get Help" → Customer Support Portal
    ↓
Submit Ticket (Type, Priority, Description)
    ↓
Ticket Auto-Routed to Support Staff
    ↓
Support Staff Views Ticket with Workspace Context
    ↓
Support Staff Responds & Resolves
    ↓
Customer Sees Resolution in Portal
    ↓
[Satisfied?] → Yes → Ticket Closed
               → No → Reopen → Support Staff Investigates Further
```

---

## ✅ Summary: What Customers See

| User Type | Login Method | What They See | Support Access |
|-----------|-------------|---------------|----------------|
| **Workspace Owner** | Replit Auth | Full workspace dashboard, all features | Customer Support Portal |
| **Manager** | Replit Auth | Team dashboard, limited features | Customer Support Portal |
| **Employee** | Replit Auth | Personal dashboard, own data only | Customer Support Portal |
| **Support Staff** | Replit Auth | Support Team Dashboard, all tickets | Full ticket queue |
| **Platform Admin** | Replit Auth | Everything + admin tools | All dashboards |

**Key Difference:**
- **Customer Support Portal** = For customers to GET help
- **Support Team Dashboard** = For your staff to PROVIDE help
- **Admin Support Dashboard** = For platform management

This is how you provide **Fortune 500-quality support to customers nationally** without giving them admin access! 🎉
