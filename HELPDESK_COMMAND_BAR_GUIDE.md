# HelpDesk Command Bar - Complete Guide

## Overview
The HelpDesk Command Bar is a horizontal toolbar above the chat interface that provides quick access to support commands and tools. The interface adapts based on user role (Guest, Subscriber, Organization User, or Support Staff).

## Command Bar Layout

### Visual Design
- **Background**: Light slate (slate-100) with clear borders for high contrast
- **Scrollable**: Horizontal scroll on smaller screens (no wrapping)
- **Sections**: Commands grouped by role and separated by vertical borders
- **Color Coding**: 
  - White buttons with slate borders: Basic commands
  - Colored backgrounds: Special actions (amber=priority, violet=AI, orange=escalate, crimson=resolved, blue=room, red=close)
  - Crimson section: Staff status controls

## Available Commands by Role

### 1. **All Users** (Guest/Subscriber/Org User/Staff)

#### Help
- **Button**: Help with HelpCircle icon
- **Action**: Opens help dialog with available commands
- **Test ID**: `button-show-help`

#### Queue
- **Button**: Queue with Users icon
- **Action**: Shows queue status and position
- **Badge**: Displays queue length when > 0
- **Test ID**: `button-show-queue`

#### Tutorial
- **Button**: Tutorial with MessageSquare icon
- **Action**: Opens interactive tutorial
- **Test ID**: `button-tutorial`

---

### 2. **Subscribers & Organization Users**

#### Account
- **Button**: Account with UserCog icon
- **Command**: `/info`
- **Action**: Display account information
- **Test ID**: `button-account-info`

#### Priority
- **Button**: Priority with Star icon (amber background)
- **Note**: Visual indicator for priority support access
- **Test ID**: `button-priority-support`

---

### 3. **Organization Users Only**

#### Organization
- **Button**: Organization with Building2 icon (purple background)
- **Note**: Visual indicator showing organization user status (no action currently)
- **Future**: Will provide access to organization settings and controls
- **Test ID**: `button-org-settings`

---

### 4. **Support Staff Only**

#### Status Controls (Crimson Section)
- **Status Dropdown**: 
  - ● Available (online)
  - ● Away
  - ● Busy
- **Staff Online Badge**: Shows count of available staff
- **Coffee Cup**: Appears when staff takes break (animated bounce)
- **Test ID**: `select-status`

#### AI Section
- **AI Greeting**: 
  - **Button**: AI Greeting with Zap icon (violet background)
  - **Command**: `/intro`
  - **Action**: Send AI-generated personalized greeting
  - **Test ID**: `button-intro-macro`

#### Quick Response Section
- **Welcome**
  - **Command**: `/welcome`
  - **Action**: Send welcome message
  - **Test ID**: `button-welcome`

- **Details**
  - **Command**: `/details`
  - **Action**: Request additional details from user
  - **Test ID**: `button-request-details`

- **Screenshot**
  - **Command**: `/screenshot`
  - **Action**: Request screenshot from user
  - **Test ID**: `button-screenshot`

- **Account**
  - **Command**: `/checkaccount`
  - **Action**: Check user account status
  - **Test ID**: `button-check-account`

- **Escalate**
  - **Command**: `/escalate`
  - **Button**: Orange background with orange border
  - **Action**: Escalate ticket to higher support tier
  - **Test ID**: `button-escalate`

- **Resolved**
  - **Command**: `/resolved`
  - **Button**: Crimson background with crimson border (Power/Authority theme)
  - **Action**: Mark ticket as resolved
  - **Test ID**: `button-resolved`

#### Control Section
- **Spectate**
  - **Command**: `/spectate`
  - **Icon**: AlertCircle (amber)
  - **Action**: Enable spectate mode (put user on hold)
  - **Test ID**: `button-spectate`

- **Voice**
  - **Command**: `/voice`
  - **Icon**: CheckCircle (crimson)
  - **Action**: Enable voice support features
  - **Test ID**: `button-voice`

- **Room**
  - **Button**: Room with Settings icon (blue background)
  - **Action**: Toggle chat room status (open/closed/maintenance)
  - **Test ID**: `button-room-status`

- **Close**
  - **Command**: `/close`
  - **Button**: Close with Power icon (red background)
  - **Action**: Close current support ticket
  - **Test ID**: `button-close-ticket`

## Banner Management (Staff Only)

Support staff can edit rotating announcement banners using the `/banner` command:

### Banner Commands
```bash
# Add a new banner
/banner add "Your message" [type] [icon] [link] [emoticon]

# Remove a banner
/banner remove <banner-id>

# List all banners
/banner list
```

### Banner Types
- `info` - Blue informational banner (default)
- `warning` - Yellow warning banner
- `success` - Crimson success banner (Power/Authority theme)
- `promo` - Purple promotional banner
- `queue` - Amber queue status banner

### Available Icons
- `alert` - AlertCircle
- `clock` - Clock
- `users` - Users
- `zap` - Zap/Lightning
- `trending` - TrendingUp
- `award` - Award
- `bell` - Bell
- `message` - MessageCircle
- `star` - Star

### Seasonal Visual Effects (Automatic)
Seasonal overlays appear automatically during these periods:
- **Snow** - December 15 - February 28 (Winter season)
- **Fireworks** - January 1-7 (New Year celebration)
- **Hearts** - February 10-20 (Valentine's Day)
- **Halloween** - October 25-31 (Halloween season)

All effects use Lucide icon components (no emojis) with CSS animations.

## Mobile Experience

### Horizontal Scrolling
- Command bar uses horizontal scroll (not wrapping)
- All buttons maintain full width and visibility
- Smooth scroll behavior enabled
- Touch-friendly button sizing (h-9 minimum)

### Accessibility
- All buttons have icons and/or text labels
- High contrast colors (dark text on light backgrounds)
- Clear borders for button separation (slate-300 to slate-600)
- Consistent spacing between sections

## Common Workflows

### For Support Staff

**1. Starting a Support Session**
```
1. Check Queue to see waiting users
2. Click Welcome to greet new user
3. Use AI Greeting for personalized introduction
4. Request Details or Screenshot if needed
```

**2. Handling Support Requests**
```
1. Set Status to "Busy" while working
2. Click Details or Screenshot to gather info
3. Use Account (/checkaccount) to verify user
4. Escalate if issue requires higher-level support
5. Click Resolved when fixed
```

**3. Managing the Chat Room**
```
1. Click Room to open status dialog
2. Select: Open, Closed, or Maintenance
3. Status broadcasts to all users via WebSocket
```

**4. Editing Announcement Banners**
```
Type in chat:
/banner add "Flash Sale: 50% off Elite tier!" promo zap https://example.com

Result: Purple promotional banner with lightning icon and link
```

**5. Privacy Controls**
```
- Click Spectate to put user on hold (silences them)
- Use Voice to enable voice chat features
- Click Close when session complete
```

### For Users (Guests/Subscribers)

**1. Getting Help**
```
1. Click Help to see available commands
2. Check Queue to see your position
3. Click Tutorial for interactive guide
```

**2. Account Management**
```
1. Click Account (subscribers only) for info
2. Staff may request you click specific buttons
3. Follow staff instructions for support
```

**3. Priority Support**
```
- Priority button available for subscribers
- Indicates you have priority support access
- Staff will see your subscriber status
```

## Technical Details

### WebSocket Integration
- All banner changes broadcast instantly
- No page refresh required for updates
- Real-time synchronization across clients

### Role-Based Access Control
- Commands filtered by user role
- Staff tools hidden from non-staff users
- Unauthorized commands blocked server-side

### Command Execution
- Buttons trigger same logic as typing slash commands
- Server validates all commands
- Responses sent through chat interface

## Color Reference

### Button Styles
| Button Type | Background | Border | Text | Use Case |
|------------|------------|--------|------|----------|
| Basic | White | slate-400 | slate-900 | Standard commands |
| Priority | amber-50 | amber-500 | amber-900 | Priority features |
| Organization | purple-50 | purple-500 | purple-900 | Org features |
| AI | violet-50 | violet-600 | violet-900 | AI commands |
| Escalate | orange-50 | orange-500 | orange-900 | Escalation |
| Resolved | red-50 | red-600 | red-900 | Resolution (Crimson) |
| Room | blue-50 | blue-600 | blue-900 | Room controls |
| Close | red-50 | red-600 | red-900 | Close ticket |
| Staff Status | red-100 | red-600 | red-900 | Staff section (Crimson) |

### Accessibility Features
- Minimum 4.5:1 contrast ratio on all buttons
- Dark text (900-level) on light backgrounds (50-level)
- Visible borders (400-600 level colors)
- Touch target minimum 36px (h-9)

## Best Practices

### For Support Staff
✅ **DO:**
- Set status to "Away" when on break
- Use Welcome at start of every session
- Click Resolved before closing tickets
- Update banners with current info
- Use Escalate when unsure

❌ **DON'T:**
- Leave status on "Available" when away
- Close tickets without resolution
- Spam quick responses
- Add too many banners (3-5 max)

### For Users
✅ **DO:**
- Click Tutorial if first time using chat
- Check Queue to see wait time
- Follow staff button prompts

❌ **DON'T:**
- Repeatedly click Priority
- Spam any buttons
- Ignore staff instructions

## Troubleshooting

### Command Not Working
1. **Check Role**: Verify you have permission
2. **Check Connection**: Look for WebSocket status
3. **Try Refresh**: Reload page if unresponsive
4. **Contact Admin**: Report persistent issues

### Visual Issues
1. **Buttons Hard to See**: 
   - Increase display brightness
   - Check browser zoom (Ctrl/Cmd +)
   - Try different browser

2. **Scroll Not Working**:
   - Use horizontal scroll on command bar
   - Touch/drag on mobile devices
   - Mouse wheel scrolls horizontally

3. **Banners Not Updating**:
   - Check WebSocket connection
   - Staff only - verify permissions
   - Use `/banner list` to check status

## Implementation Notes

### Current Features
- ✅ Horizontal scroll layout (no wrapping)
- ✅ Role-based command filtering
- ✅ Real-time WebSocket updates
- ✅ Seasonal visual effects
- ✅ Mobile-responsive design
- ✅ High contrast accessibility

### Command List
All staff commands use slash notation when typed:
- `/intro` - AI greeting
- `/welcome` - Welcome message
- `/details` - Request details
- `/screenshot` - Request screenshot
- `/checkaccount` - Check account
- `/escalate` - Escalate ticket
- `/resolved` - Mark resolved
- `/spectate` - Spectate mode
- `/voice` - Voice features
- `/close` - Close ticket
- `/info` - Account info (subscribers)
- `/banner` - Banner management (staff)

### Test Identifiers
Every interactive element has a `data-testid` for automated testing:
- `button-show-help`
- `button-show-queue`
- `button-tutorial`
- `button-account-info`
- `button-priority-support`
- `button-org-settings`
- `select-status`
- `button-intro-macro`
- `button-welcome`
- `button-request-details`
- `button-screenshot`
- `button-check-account`
- `button-escalate`
- `button-resolved`
- `button-spectate`
- `button-voice`
- `button-room-status`
- `button-close-ticket`
