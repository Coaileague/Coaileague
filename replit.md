# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary purpose is to streamline operations and reduce administrative burdens through features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform adopts an "OS" design philosophy for extensibility, aiming to be a single source of truth for workforce management, and revolutionizing the industry with a subscription and usage-based AI revenue model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

### Navigation & UX Preferences (Added November 2025)
- **No Refresh Buttons**: Platform should NOT have refresh buttons in headers/toolbars
- **Role-Aware Settings Gear**: Settings gear icon in header routes based on user role:
  - Regular users → Organization settings (`/settings`)
  - Support roles (leaders, deputy admins) → Admin tools (`/admin-command-center`)
  - ROOT/SYSOP admins → Platform management (`/platform-admin` - maintenance mode, services control)
- **Universal Back Navigation**: Every page, modal, dialog needs clear exit/cancel/back buttons to prevent users from getting stuck and losing work
- **Unsaved Changes Protection**: Forms and pages with editable content must warn users before navigation/close to prevent accidental data loss

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) to ensure clean code and extensibility.

### Advanced Billing & Usage-Based Pricing
The platform utilizes a hybrid pricing model for AI-powered OS modules, combining subscriptions with overage charges based on token usage. Non-AI modules operate on a flat subscription model. Monthly token allowances are tracked per workspace, with overage usage billed at a profitable rate.

### UI/UX Decisions
The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach with responsive layouts and accessible touch targets. The branding uses an "AF" lightning bolt logo within a circular green gradient badge. All user-facing pages consistently use emerald/green/teal colors for brand identity, with a uniform dark gradient background and emerald accents.

**Mobile-First PWA Transformation (COMPLETED November 2025)**:
- **Design Tokens**: Comprehensive mobile-first CSS variables for breakpoints (sm/md/lg/xl), touch targets (48px minimum), mobile spacing scales, typography scales, navigation heights, safe areas (iOS notch), and z-index layering
- **PWA Infrastructure**: Complete Progressive Web App setup with manifest.json (AutoForce™ branding, Emergency Green theme), service worker for offline support and caching (cache-first app shell, network-only APIs), and installability support
- **Responsive Context**: ResponsiveAppFrame provider integrated into App.tsx with useMobile() hook for device detection (mobile/tablet/desktop), touch capabilities, platform detection (iOS/Android), orientation tracking, and PWA install prompts
- **Native App Utilities**: CSS utility classes for mobile-touch-target (48px min), mobile-safe-area (iOS notch padding), mobile-bottom-nav, mobile-header, pull-to-refresh animations, swipeable gestures, smooth scrolling, active states, and mobile sheets
- **Adaptive Navigation**: Sidebar on desktop/tablet automatically transforms into bottom navigation bar on mobile with Emergency Green gradient active states, z-50 stacking, and conditional rendering (hidden for HelpDesk/special pages)
- **Mobile Layout Primitives**: MobilePageWrapper (with pull-to-refresh), MobilePageHeader, MobileGrid, MobileCard, MobileBottomSheet, and MobileActionSheet components for native app-style layouts
- **CommOS™ Mobile Migration**: Private messages page transformed with adaptive layout (conversation list OR chat on mobile, both on desktop), mobile back button, bottom sheet modals, touch-optimized controls, and iOS safe area support
- **Touch Gestures**: Pull-to-refresh in MobilePageWrapper, 48px minimum touch targets applied throughout via .mobile-touch-target class, swipe gesture utilities available
- **Performance Optimizations**: OptimizedImage component with lazy loading and loading states, service worker asset caching, React Query for data caching

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: Implements hierarchical roles and API protection.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture for real-time interactions. The chat system includes:
    - **HelpDesk5/LiveChat**: Mobile and desktop optimized support chat for organizations to interact with AutoForce™ support.
    - **CommOS™**: Organization-specific chatrooms with role-based access, supporting regular users, organization leaders, and platform support staff with specialized functionalities. Inactive rooms are automatically archived.
    - WebSocket protocol issues, specifically with `wss://` URLs, have been resolved across all related hooks.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management, shift management, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control.
    - **Communication**: Team Communication (CommOS™) with multi-room chat, AES-256-GCM encrypted private messages, and advanced features:
        - **Message Reactions**: Slack/Discord-style emoji reactions on any message
        - **Message Threading**: Reply to specific messages creating organized conversation threads
        - **File Uploads**: Share images, PDFs, documents with preview and thumbnails
        - **@Mentions**: Tag users with autocomplete and notification system
        - **Read Receipts**: Track who has read each message with timestamps
        - **Rich Text Formatting**: WYSIWYG editor for bold, italic, lists, code blocks
        - **Live Room Browser**: Real-time room activity tracking with WebSocket-powered online user counts, status indicators, and join/leave functionality
        - **Message Search**: Full-text search with flexible filtering supporting query text, room selection, and date ranges (any combination)
        - **Voice/Video Calling**: WebRTC-powered real-time audio/video communication with signaling security (room membership verification) and full call controls (mute, video toggle, end call)
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and AI-powered generation.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding, and HelpDesk queue management.
    - **HelpOS™ FAQ System**: AI-powered knowledge base with semantic search and continuous learning from support interactions:
        - **Semantic Search**: OpenAI embedding-based search finds answers even when exact keywords don't match
        - **Auto-Generation from Tickets**: Converts resolved support tickets into reusable FAQ entries using GPT-3.5
        - **Conversation Refinement**: Refines raw Q&A from live support chats into professional FAQ entries
        - **Bulk Import**: Imports multiple FAQs for new feature releases with automatic embedding generation
        - **Draft-First Workflow**: All AI-generated FAQs start as drafts requiring staff review before publication
        - **Publish Status Control**: Unpublished FAQs only visible to platform staff for quality assurance
    - **HelpOS™ Autonomous Bot**: Intelligent support agent that provides bot-first assistance with human escalation:
        - **State Machine**: greeting → searching → answering → clarifying → escalating/resolved flow
        - **FAQ-Powered Responses**: Uses semantic search to find relevant answers with confidence scoring (>85% high, >70% medium, <70% escalates)
        - **Sentiment Detection**: Recognizes user satisfaction vs. escalation needs from conversation signals (2+ signals required)
        - **Auto-Resolution**: Closes satisfied tickets, generates FAQ suggestions, notifies staff of success
        - **Smart Escalation**: Hands off complex issues to human staff with context preservation
        - **Dual Notification System**: 
            - **Chat Announcements**: Staff-only inline messages in HelpDesk room for real-time awareness
            - **Database Notifications**: System notifications sent to all support staff (ROOT, DEPUTY_ADMIN, DEPUTY_ASSISTANT, SYSOP) ensuring agents are notified even when not in chat/dashboard
        - **Bot Workflow Tools**: searchKnowledgeBase, detectUserSentiment, checkTicketStatus, formatFaqAnswer
        - **Decision Logic**: Multi-factor analysis determines search/present/clarify/escalate/close actions with confidence scoring
        - **Continuous Learning**: Successful bot conversations become FAQ entries after staff review
        - **Graceful Degradation**: Automatically disabled when OpenAI API key unavailable
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-3.5-turbo (for HelpOS support bot), GPT-4o-mini (for advanced features)