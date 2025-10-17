# Banner Manager - Quick Start Guide

## 🎯 What is Banner Manager?

The Banner Manager is a powerful tool for creating eye-catching announcement banners with holiday templates, custom designs, and animated effects. Perfect for promotions, announcements, and seasonal campaigns!

## 📍 Where to Access It

### **In HelpDesk Chat (Desktop)**
1. **Log in as Staff** (root, deputy_admin, deputy_assistant, or sysop)
2. **Navigate to HelpDesk** at `/helpdesk-cab`
3. **Look in the header** (top right area, next to connection status)
4. **Click "Banner Manager" button** (purple sparkle icon ✨)

### **In HelpDesk Chat (Mobile)**
- The Banner Editor Dialog is available in mobile chat (`/helpdesk5`)
- Access it through the staff menu

## 🎨 Features

### 1. **Holiday Templates** (11 Pre-Made)
Choose from professionally designed templates for:
- ✨ **New Year** (Jan 1-7) - Fireworks animation
- ❤️ **Valentine's Day** (Feb 10-20) - Hearts animation
- 🌸 **Spring Sale** (Mar 15-31)
- 🇺🇸 **Independence Day** (Jul 1-7) - Fireworks animation
- 📚 **Back to School** (Aug 15-31)
- 👻 **Halloween** (Oct 25-31) - Spooky animation
- 🦃 **Thanksgiving** (Nov 20-28)
- ⚡ **Black Friday** (Nov 29) - Special dark theme
- 💻 **Cyber Monday** (Dec 2) - Fireworks animation
- 🎄 **Christmas** (Dec 15-31) - Snow animation
- 🎊 **Year End Sale** (Dec 28-31) - Fireworks animation

### 2. **Custom Banner Creator**
Create your own banners with:
- **Custom Message** - Any text you want
- **Banner Types**:
  - 📘 Info (Blue) - General announcements
  - ⚠️ Warning (Yellow) - Important notices
  - ✅ Success (Green) - Positive updates
  - 🎁 Promo (Purple) - Special offers
- **Icons** - Choose from 10+ professional icons
- **Links** - Add clickable URLs

### 3. **Banner Management**
- **View All Active Banners** - See what's currently displayed
- **Copy Banners** - Duplicate existing banners to edit
- **Remove Banners** - Delete banners with one click
- **Real-Time Updates** - Changes appear instantly via WebSocket

## 🚀 How to Use

### **Option 1: Use a Holiday Template**
1. Click **"Banner Manager"** button in header
2. Go to **"Holiday Templates"** tab
3. Browse the templates
4. Click **"Use Template"** on your chosen design
5. ✅ Done! Banner appears instantly for all users

### **Option 2: Create Custom Banner**
1. Click **"Banner Manager"** button in header
2. Go to **"Custom Banner"** tab
3. Enter your message
4. Select banner type (Info/Warning/Success/Promo)
5. Choose an icon
6. (Optional) Add a link
7. Click **"Create & Publish Banner"**
8. ✅ Done! Banner appears instantly for all users

### **Option 3: Use Slash Commands**
You can also use commands directly in chat:
```
/banner add "Your message" type icon link
```

**Examples:**
```
/banner add "Flash Sale: 50% OFF!" promo zap
/banner add "System maintenance in 1 hour" warning clock
/banner add "New feature released!" success star https://example.com
```

## 🎭 Visual Effects

Certain banners include **automatic seasonal animations**:
- **❄️ Snow** - Winter holidays (floating snowflakes)
- **🎆 Fireworks** - New Year, July 4th, special events
- **💕 Hearts** - Valentine's Day (floating hearts)
- **🎃 Halloween** - October (spooky ghosts)

These effects are **automatic** based on the template or date!

## 📊 Banner Types & Colors

| Type | Color | Best For | Icon Suggestions |
|------|-------|----------|------------------|
| **Info** | Blue | General announcements, tips | bell, message, users |
| **Warning** | Yellow | Important notices, alerts | alert, clock |
| **Success** | Green | Positive updates, achievements | star, award, trending |
| **Promo** | Purple | Sales, special offers | zap, heart, star |

## 🔧 Advanced Usage

### **Managing Multiple Banners**
1. Go to **"Manage"** tab in Banner Manager
2. See all active banners
3. **Copy** - Duplicate a banner to edit
4. **Remove** - Delete with one click

### **Preview Before Publishing**
- Click the **eye icon** (👁️) on any template
- See exactly how it will look
- Use it if you like it!

### **Slash Command Reference**
```bash
# Add banner
/banner add "message" type icon [link]

# Remove banner
/banner remove <banner-id>

# List banners
/banner list
```

## 💡 Pro Tips

1. **Seasonal Timing** - Schedule holiday banners in advance
2. **Keep Messages Short** - 1-2 sentences work best
3. **Use Emojis Sparingly** - Icons are better (no emoji violations)
4. **Test Links** - Make sure URLs work before publishing
5. **Update Regularly** - Fresh banners keep users engaged
6. **Monitor Performance** - See which banners get clicks
7. **Brand Consistency** - Use colors that match your brand

## 🎯 Example Use Cases

### **Flash Sale**
```
Template: Black Friday or Cyber Monday
Message: "LIMITED TIME: 60% OFF all plans!"
Type: Promo
Icon: Zap
```

### **Maintenance Notice**
```
Template: Custom
Message: "System maintenance tonight 10PM-12AM EST"
Type: Warning
Icon: Clock
```

### **New Feature Launch**
```
Template: Custom
Message: "NEW: AI-powered scheduling now available!"
Type: Success
Icon: Trending
Link: https://yoursite.com/features
```

### **Holiday Greeting**
```
Template: Christmas (or any holiday)
Message: Auto-filled with seasonal greeting
Type: Promo
Includes: Snow animation ❄️
```

## 🏠 Home Page Banners

Currently, the home page (landing page) **does not have a banner**.

**To add one:**
1. We can add the same banner system to the landing page
2. Would you like a banner on the home page for marketing?
3. Let me know and I can add it!

## 📱 Mobile Access

The Banner Manager works on:
- ✅ Desktop (primary interface)
- ✅ Mobile HelpDesk chat
- ✅ All screen sizes (responsive)

## 🆘 Troubleshooting

**Banner not appearing?**
- Check WebSocket connection (green dot in header)
- Refresh the page
- Verify you're logged in as staff

**Can't access Banner Manager?**
- Must be logged in as Staff role
- Button only appears in header for staff users
- Check you're on `/helpdesk-cab` page

**Template not working?**
- Verify date range (some are seasonal)
- Check console for errors
- Try a custom banner instead

## 🔐 Permissions

**Who can manage banners?**
- ✅ Root Admin
- ✅ Deputy Admin
- ✅ Deputy Assistant
- ✅ SysOp
- ❌ Regular users (view only)

## 🎉 Quick Win Examples

### **Right Now** (Any Time)
```
Message: "🎯 Special Offer: Get 30% off your first month!"
Type: Promo | Icon: Star
```

### **Monday Morning**
```
Message: "☀️ Good morning! Need help? Our team is here for you!"
Type: Info | Icon: Users
```

### **Friday Afternoon**
```
Message: "🎊 Happy Friday! Weekend support available 24/7!"
Type: Success | Icon: Award
```

---

## 🚀 Get Started Now!

1. **Log in as Staff**
2. **Go to HelpDesk** (`/helpdesk-cab`)
3. **Click "Banner Manager"** (header, top right)
4. **Choose a template or create custom**
5. **Publish and watch it appear instantly!**

**Questions?** Type `/help` in the chat or check the full documentation.

---

*💡 Remember: All banner updates happen in real-time via WebSocket - no page refresh needed!*
