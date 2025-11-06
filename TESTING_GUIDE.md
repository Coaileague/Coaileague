# AutoForce™ Testing Guide
**Manual Chat System & Shift Audit Features**

## ✅ What's Been Built

### Frontend Components
1. **ShiftActionsMenu** (`client/src/components/shift-actions-menu.tsx`)
   - Dropdown menu on every shift card (appears on hover)
   - 3 actions: Create Chat, View Audit Data, Clock In/Out
   
2. **CreateChatDialog** (embedded in ShiftActionsMenu)
   - Chat subject input
   - Chat type selector (4 types)
   - Guest invitation form (name, email, phone)
   - Linked to shift automatically
   
3. **AuditDataDialog** (embedded in ShiftActionsMenu)
   - Shift information summary
   - Employee details
   - Time tracking with GPS coordinates
   - Discrepancies highlighting
   - Summary statistics

### Backend APIs
1. **POST /api/chats/create** (lines 5079-5172 in server/routes.ts)
   - Creates chatroom with participants
   - Supports guest token invitations
   - Links to specific shift
   
2. **GET /api/shifts/:id/audit** (lines 4941-5076 in server/routes.ts)
   - Returns comprehensive audit data
   - Includes GPS, time tracking, discrepancies
   
3. **POST /api/expense-categories/seed** (lines 4249-4284 in server/routes.ts)
   - Seeds 8 default expense categories
   - For workspaces created before auto-seeding

---

## 🧪 Testing Instructions

### Test 1: Expense Categories Seed (Backend API)
**For workspaces created before auto-seeding was implemented**

1. Login as Manager/Admin
2. Open browser console (F12)
3. Run:
```javascript
fetch('/api/expense-categories/seed', {
  method: 'POST',
  credentials: 'include'
})
.then(r => r.json())
.then(console.log)
```

**Expected Result:**
```json
{
  "message": "Seeded 8 default categories",
  "categories": [
    { "name": "Mileage", ... },
    { "name": "Meals", ... },
    ...
  ]
}
```

---

### Test 2: Shift Actions Menu (Frontend UI)

1. Navigate to **Schedule Grid** page
2. Hover over any shift card
3. Click the **three-dot menu** (top right of shift card)

**Expected Result:**
- Dropdown appears with 3 options:
  - Create Chat
  - View Audit Data
  - Clock In/Out

---

### Test 3: Create Chat Dialog

1. From shift actions menu, click **"Create Chat"**
2. Test the form:
   - Enter chat subject (or leave default)
   - Select chat type (4 buttons)
   - Optionally add guest invitation:
     - Guest Name: "John Customer"
     - Guest Email: "john@example.com"
     - Guest Phone: "+1 555-0000"
3. Click **"Create Chat"**

**Expected Result:**
- Success toast: "Chat Created - Chatroom created successfully!"
- Dialog closes
- Backend creates conversation with shift link

**Backend Payload:**
```json
{
  "subject": "Shift Chat - Nov 06, 2025",
  "chatType": "customer_support",
  "shiftId": "<shift-id>",
  "participantIds": [],
  "guestInvitations": [{
    "name": "John Customer",
    "email": "john@example.com",
    "phone": "+1 555-0000",
    "expiresInDays": 7
  }],
  "conversationType": "shift_chat"
}
```

---

### Test 4: View Audit Data

1. From shift actions menu, click **"View Audit Data"**
2. Wait for data to load

**Expected Result:**
Dialog displays:
- **Shift Information**: Title, Status, Start/End Time
- **Employee**: Name, Email
- **Time Tracking**: Clock In/Out times with GPS coordinates
- **GPS Location**: Latitude/Longitude with accuracy
- **Summary**: Total Hours, Total Amount, Discrepancies count
- **Discrepancies**: Any detected issues (if applicable)

**Sample Data:**
```json
{
  "shift": {
    "title": "Emergency Response",
    "status": "published",
    "startTime": "2025-11-06T09:00:00Z",
    "endTime": "2025-11-06T17:00:00Z"
  },
  "employee": {
    "name": "Jane Doe",
    "email": "jane@autoforce.com"
  },
  "timeTracking": [{
    "clockIn": "2025-11-06T09:00:00Z",
    "clockOut": "2025-11-06T17:00:00Z",
    "gps": {
      "clockIn": {
        "latitude": 37.7749,
        "longitude": -122.4194,
        "accuracy": 10
      }
    }
  }],
  "summary": {
    "totalHours": 8.0,
    "totalAmount": 240.00,
    "totalDiscrepancies": 0
  }
}
```

---

### Test 5: Backend API Direct Test

**Test Shift Audit API:**
```javascript
// Get a shift ID from schedule page first
const shiftId = 'your-shift-id-here';

fetch(`/api/shifts/${shiftId}/audit`, {
  credentials: 'include'
})
.then(r => r.json())
.then(console.log)
```

**Test Chat Creation API:**
```javascript
fetch('/api/chats/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    subject: 'Test Chat',
    chatType: 'employee_to_employee',
    shiftId: 'your-shift-id',
    participantIds: [],
    guestInvitations: [],
    conversationType: 'shift_chat'
  })
})
.then(r => r.json())
.then(console.log)
```

---

## 🔍 What to Check

### Functionality Checklist
- [ ] Shift actions menu appears on hover
- [ ] All 3 menu options clickable
- [ ] Create Chat dialog opens with all form fields
- [ ] Chat type buttons toggle correctly
- [ ] Guest invitation fields accept input
- [ ] Chat creation submits successfully
- [ ] Audit Data dialog opens and loads data
- [ ] GPS coordinates display correctly
- [ ] Discrepancies highlighted if present
- [ ] Expense categories seed successfully

### Error Cases to Test
- [ ] Creating chat without shift ID
- [ ] Viewing audit for non-existent shift
- [ ] Seeding categories twice (should skip duplicates)
- [ ] Creating chat as non-manager (if required)
- [ ] Invalid guest email format

### UI/UX Checklist
- [ ] Menu button visible on shift hover
- [ ] Dialogs centered and responsive
- [ ] Loading states show while fetching data
- [ ] Success/error toasts appear
- [ ] Forms validate before submission
- [ ] Audit data displays cleanly
- [ ] GPS coordinates formatted properly

---

## 📊 Test Data Requirements

### Minimum Requirements
1. At least **1 published shift** in schedule
2. At least **1 employee** assigned to shift
3. At least **1 time entry** for shift (for audit data)
4. **Manager/Admin account** for chat creation

### Optional (for full testing)
- Shift with **GPS clock-in data**
- Shift with **discrepancies**
- Shift with **multiple time entries**
- Workspace **without expense categories** (to test seeding)

---

## 🐛 Common Issues

### Issue: Menu doesn't appear on hover
**Solution:** Check that shift cards have `group` class and menu has `group-hover:opacity-100`

### Issue: Audit data shows "No audit data available"
**Solution:** Ensure shift has time entries in database

### Issue: Chat creation fails
**Solution:** Check user has manager role and workspace permissions

### Issue: Expense seeding fails
**Solution:** Categories may already exist (check /api/expense-categories endpoint)

---

## 🚀 Next Steps After Testing

1. **TimeOS™ Messaging** - Shift notifications and reminders
2. **E2E Testing** - Playwright tests for full workflows
3. **Production Launch** - Zero errors before charging customers

---

## 📝 Notes

- All features use **Emergency Green (#10b981)** branding
- Chat system reuses `chatConversations` infrastructure
- Audit data aggregates from `timeEntries` table
- Guest tokens expire after 7-30 days (configurable)
- Private Messages use AES-256-GCM encryption
- CommOS rooms are always monitored for safety
