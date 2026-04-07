# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is an AI-powered, multi-tenant workforce management platform designed to optimize HR functions for large organizations. It offers profit-optimized scheduling, strategic business intelligence, and comprehensive compliance management. The platform aims to be an efficient, AI-driven solution for workforce intelligence, enhancing business vision and market potential.

## User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

## System Architecture
CoAIleague utilizes a robust multi-tenant architecture with RBAC security, centralized dynamic configuration, modularity, type safety, and 100% LSP clean code. It differentiates between a production tenant ("Statewide Protective Services") and a development sandbox ("ACME Security"), enforcing strict separation.

**UI/UX Decisions:**
The platform features a responsive, WCAG-compliant design with fluid typography and Material 3-inspired components. It includes enhanced chat visuals, a Universal Component Architecture with design tokens, universal mobile PWA & TWA experiences with advanced animations and offline capabilities, professional PDF generation, interactive drag-and-drop scheduling, and bilingual support (EN/ES).

**Technical Implementations:**
A hybrid AI architecture integrates Google Gemini, Anthropic Claude, and OpenAI GPT-4, with AI isolation per workspace. The Trinity C-Suite Intelligence Layer provides "Super ADHD Pattern Recognition" for anomalies, per-organization pattern learning, autonomous bot delegation, and a 7-step issue resolution pipeline. Cognitive enhancements include Extended Thinking, an Uncertainty Framework, a Clarification Engine, a Reasoning Verifier, and Peripheral Awareness. Compliance features include Regulatory Credential Enrollment and an Auditor Portal. Advanced scheduling offers recurring shifts and a shift marketplace with AI compliance checks. Other features include GPS-verified time tracking, a Cognitive Onboarding Service, a Trinity Chat Interface, a Universal Inbox System, a Universal Orchestration Step Logger, and support for W-2 employees and 1099 contractors. A DocuSign-style document execution system and real-time license checks are integrated. Financial systems ensure idempotency, robust webhook handling, ledger entries, race condition fixes, integer-cent arithmetic, and cross-tenant workspace isolation. An 8-phase agent orchestration system with DB tracking and a HelpAI QA layer is implemented. Architectural additions include URL state synchronization, cross-page cache invalidation, and multi-layer Error Boundaries. A Visitor & Guest Management System, Trinity Intelligence Upgrade with AI insights, Onboarding Task Management, and Equipment, Key & Asset Tracking are included. Access control is enforced with specific middleware. Every entity has a canonical human-readable ID (e.g., ORG-TX-00142) for improved identification. The system now includes a comprehensive support organization with an autonomous resolution system via SMS, email, and voice channels, leveraging a 5-tier pipeline (FAQ, Category, Trinity AI, Human Escalation).

**System Design Choices:**
Security features include AES-256-GCM encryption, RBAC (with auditor hard enforcement), per-org credential isolation, API rate limiting, multi-tenant isolation, Helmet hardening, and XSS sanitization. Concurrent operation locks, an event bus with retries, and a daemon registry ensure robust operation. A universal authentication system (session-based with 2FA) and a unified WebSocket architecture handle real-time communication. Financial audit trails are SOC-2-tagged with atomic ledger writes. Offline clock-in attempts are queued. Dynamic configuration is managed by a Unified Config Registry and a DB-backed orchestration registry, now with a canonical configuration values system for all enum-like fields. An AI/Automation Bypass Pattern allows for elevated access. Trinity acts as an operational orchestrator with checkpoint/pause/resume capabilities. A canonical position registry defines 22 security positions with RBAC. Performance is optimized with a Cache Manager, AI Request De-duplicator, Write Batcher, and extensive use of React.memo/useMemo and server-side pagination. A 3-layer orchestration standard defines primitives, AI routing, and domain wrappers. A sub-organization hierarchy system supports consolidated billing and reporting. Global Express error handling, request ID tracing, workspace activity guards, and an AI retry wrapper are implemented. The Universal Notification Engine delivers alerts, and a Mileage Log module supports reimbursement. Drizzle schema is organized into 16 domains with a strict 3-layer route hierarchy. A Legal Protection Layer includes TOS Agreements Schema and UI components for mandatory legal gates. Workforce records are retained for 7 years. A State Regulatory Auditor Partner Portal is provided. Business Intelligence dashboards utilize precomputed aggregate tables and daily snapshots. Global Search offers full-text indexing and role-gating. GDPR/CCPA Privacy Compliance includes DSR management, PII anonymization, and version-aware Terms acceptance. A 5-state subscription lifecycle FSM is implemented with Stripe webhook handling. Time Zone Management and a Holiday Calendar are integrated. An Outbound Webhook System with HMAC-SHA256 signing and exponential backoff is available. Feature Flags allow for global, workspace, rollout percentage, and tier-based feature control. A public Status Page provides service health. A comprehensive automated test suite covers unit, API, E2E, and regression tests. Performance hardening includes Gzip compression, PostgreSQL optimization, and feature flag caching. All public-facing references to specific AI models have been abstracted for white-label compatibility. The system has migrated to flat-rate billing.

## External Dependencies
- **Stripe**: Payment processing, subscriptions, direct deposit payouts.
- **Plaid**: ACH payroll direct deposit for bank account verification and transfer initiation.
- **Resend**: Email delivery for transactional emails.
- **Google Gemini**: Primary AI intelligence engine (3 Pro Preview, 2.5 Pro/Flash, 1.5 Flash 8B).
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications and Trinity Voice Phone System (IVR, call routing, transcription).
- **Anthropic Claude**: AI for financial, compliance, and strategic planning.
- **OpenAI GPT-4**: AI for customer support escalations and content generation.
- **OpenAI Whisper**: Used for voice transcription.
- **OpenAI TTS**: Used for text-to-speech.