# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary goal is to streamline operations, reduce administrative burdens, and serve as a single source of truth for workforce management. Key features include time tracking with advanced verification, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform employs an "OS" design philosophy for extensibility and aims for a hybrid subscription and usage-based AI revenue model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.
DESIGN: Professional Fortune 500 aesthetic - NO bright glowing colors (green-500, blue-500, amber-500, etc.). Use muted professional tones from design_guidelines.md only.
No Refresh Buttons.
Universal Back Navigation: Every page, modal, dialog needs clear exit/cancel/back buttons.
Unsaved Changes Protection: Forms and pages with editable content must warn users before navigation/close.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) to ensure clean code and extensibility.

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and Evergreen/Steel Blue/Professional Teal accents as defined in `design_guidelines.md`. It prioritizes a mobile-first approach with responsive layouts, accessible touch targets, and PWA capabilities. Branding includes an "AF" lightning bolt logo within a circular green gradient badge. Key navigation elements include a floating header, visible labels for navigation buttons, and contextual breadcrumb navigation.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including features like account locking and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: A comprehensive two-tier hierarchical role system separates platform support roles from organization/tenant management roles, enforced via TypeScript and guard middleware.
- **Communication**:
    - **HelpDesk (Consolidated Chat System)**: Features a unified `/chat` experience with Gemini AI integration, connection error handling, and usage-based billing for AI features. It supports public access for guests (human support only) and full AI functionality for workspace members.
    - **CommOS™**: Organization-specific chatrooms with role-based access, supporting private messages (AES-256-GCM encrypted), message reactions, threading, file uploads, @mentions, read receipts, rich text formatting, and WebRTC-powered voice/video calling.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management, shift management, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and **hybrid constraint solver + GPT-4 validation** for optimal schedule generation (constraint satisfaction algorithm computes optimal assignments, GPT-4 validates and explains results).
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding, and HelpDesk queue management.
    - **Organization Support System**: Internal support ticket escalation workflow.
    - **HelpOS™ FAQ System**: AI-powered knowledge base with semantic search and auto-generation from resolved tickets.
    - **HelpOS™ Autonomous Bot**: An intelligent support agent with usage-based billing providing bot-first assistance, human escalation, FAQ-powered responses, sentiment detection, auto-resolution, and smart escalation with context preservation. All AI token usage is tracked and billed.
    - **RecordOS™ - AI-Powered Natural Language Search**: Semantic search using GPT-3.5-turbo to convert natural language queries into structured searches across employees, clients, invoices, shifts. Includes AI usage tracking and billing.
    - **InsightOS™ - AI Analytics & Autonomous Insights**: Real-time GPT-4o-powered analytics that analyzes workspace metrics (employees, clients, labor costs, revenue) to generate 3-5 actionable insights with priorities, confidence scores, suggested actions, and estimated business impact. Includes AI usage tracking and billing.
    - **DispatchOS™ - Computer-Aided Dispatch**: Backend implementation is complete, featuring GPS tracking, unit status management, incident queue, dispatcher command center, and comprehensive audit logging. Real-time updates are handled via WebSockets. (Frontend for map visualization is pending).
- **Security**: Includes Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.
- **Production Monitoring**: Comprehensive observability infrastructure with error logging, performance metrics tracking, health checks, slow request detection, and graceful shutdown handling.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**:
    - OpenAI GPT-3.5-turbo (HelpOS support bot, RecordOS search)
    - Gemini 2.0 Flash Exp (HelpDesk chat)
    - GPT-4 (ScheduleOS validation & explanation - constraint solver does optimization)
    - GPT-4-turbo (DisputeAI grievance analysis)
    - GPT-4o (PredictionOS predictions, InsightOS analytics)
    (All AI integrations include comprehensive usage tracking and billing in the aiUsage table.)
    - **Constraint Solving**: TypeScript CSP solver for ScheduleOS™ optimal shift assignments (hard + soft constraints)