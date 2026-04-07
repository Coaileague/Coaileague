---
name: trinity-architecture
description: Trinity AI ambient co-pilot architecture specification for CoAIleague. Use when building, modifying, or reviewing any Trinity-related feature — FAB, modal, routing, user roles, acceptance criteria, or roadmap items.
---

# CoAIleague — TRINITY AI SYSTEM
### Architecture & Implementation Specification
**Version 1.0 | March 2026 | CONFIDENTIAL**

---

## Executive Summary

Trinity is the unified AI intelligence layer of the CoAIleague workforce management platform. She is not a chatbot, a help widget, or a generic assistant. Trinity is a purpose-built orchestration system designed specifically for the security industry — available 24/7, calm under pressure, and connected to every operational system in the platform.

Trinity serves as the front door to all AI-powered capabilities. For frontline security officers, she answers questions, helps with schedules, and guides daily tasks. For supervisors and managers, she surfaces insights, flags anomalies, and executes automated workflows. For organization owners, she provides executive intelligence, compliance oversight, and business-critical alerts.

Behind Trinity's neutral, always-available interface lives a tiered intelligence system: a reasoning triad of three AI models, a set of specialized domain bots, and a human escalation pathway. Everything is invisible to the user. They simply talk to Trinity.

> **Design Principle:** Trinity is the only face the user ever sees. All complexity — model routing, bot delegation, human escalation — happens silently behind her. The user experience is always: one interface, one name, one trusted system.

---

## 1. Trinity's Identity & Role

Trinity is the CoAIleague AI persona — consistent, professional, and industry-aware. She speaks plainly to officers, precisely to managers, and strategically to owners. Her tone adapts to context but her identity never changes.

Trinity is NOT a wrapper around a generic AI product. She has context about the organization, the team, the schedule, payroll state, compliance requirements, and incident history.

**Trinity handles three zones:**
- **Direct Response** — Questions she answers immediately from platform data and her reasoning triad
- **Delegated Execution** — Tasks routed to specialized domain bots
- **Human Escalation** — Situations requiring management judgment, approval, or intervention

---

## 2. Tiered Intelligence Architecture

| Tier | Name | Handled By | Response Time |
|------|------|------------|---------------|
| Tier 1 | Direct Intelligence | Trinity Reasoning Triad | < 3 seconds |
| Tier 2 | Domain Execution | Specialized Platform Bots | 3–15 seconds |
| Tier 3 | Human Escalation | Supervisors / Managers / Owner | Minutes to Hours |

### Tier 1 — Trinity's Reasoning Triad

| Model | Primary Role | Fallback |
|-------|-------------|---------|
| **Gemini** | Primary orchestrator. Scheduling logic, availability analysis, coverage gap detection, query classification. | If fails → Claude activates as primary |
| **Claude** | Validator. Compliance checks, contract interpretation, nuanced communication drafting, policy questions. | If Gemini unavailable → Claude becomes primary |
| **OpenAI** | Backup and broadband reasoning. Broad general knowledge, natural language generation, edge cases. | Last resort fallback. |

> **Cost Control:** All AI token usage attributed to the org (`org_id`) making the request — never absorbed by the platform.

### Tier 2 — Specialized Domain Bots

**Payroll Bot** — payroll questions, earnings disputes, pay period calculations, deductions, QuickBooks sync. Read timesheets/pay rates; write restricted to draft only — no live execution without human approval.

**Scheduling Bot** — open shift coverage, conflicts, availability, swaps, overtime. Read/write to schedule; cannot publish without manager approval unless auto-publish enabled.

**Compliance Bot** — license expiry, PERC cards, certs, state regulations, overtime compliance. Read employee records; escalates violations to management immediately.

**Notification Bot** — broadcasts, alerts, reminders, emergency notifications. Executes sends only after Trinity confirms intent; mass notifications require confirmation step.

**Incident Bot (Future)** — incident report submission, escalation, evidence uploads.

### Tier 3 — Human Escalation

| Trigger | Escalates To |
|---------|-------------|
| Termination / disciplinary action | Org Owner / HR |
| Payroll dispute above threshold | Manager / Owner |
| Officer in distress / safety alert | Supervisor on duty |
| Client complaint / SLA risk | Account Manager / Owner |
| Compliance violation detected | Owner / Compliance Lead |
| System error Trinity cannot resolve | Development / Support |

---

## 3. Query Classification & Routing Logic

Every request classified on four dimensions before routing:

| Dimension | Values | Routing Impact |
|-----------|--------|----------------|
| **Domain** | Payroll / Schedule / Compliance / Incident / General | Which bot receives the task |
| **Complexity** | Low / Medium / High / Critical | Model selection; Critical = human loop required |
| **Role** | Staff / Supervisor / Manager / Owner | Data visibility and available actions |
| **Urgency** | Routine / Time-Sensitive / Urgent / Emergency | Response speed, notification priority, human loop |

---

## 4. Trinity Experience by User Role

### Frontline Officer
- **Access:** personal schedule, timesheets, pay stubs, open shifts in their area
- **Cannot see:** other employees' pay, org-wide compliance, management communications
- **Can do:** show own data, submit calloff requests, recommend open shifts, guide incident docs
- **Escalates to:** direct supervisor for approvals, payroll manager for disputes

### Supervisor
- **Access:** assigned team schedules, timesheets, clock-in status, open shift marketplace, broadcast tools
- **Can do:** identify gaps, propose fills, send targeted notifications, pull team status
- **Escalates to:** Manager/Owner for large changes, compliance violations, pay disputes

### Manager / Org Owner
- **Access:** everything — all employees, all sites, payroll, compliance, billing, client contracts
- **Can do:** executive summaries, flag anomalies, draft communications, initiate payroll workflows, surface compliance risks
- **Escalates to:** human judgment only for irreversible actions (termination, legal, client SLA breaches)

---

## 5. Mobile UI Specifications — SOURCE OF TRUTH

### FAB (Floating Action Button)

| Property | Value |
|----------|-------|
| **Position** | `fixed`, `bottom: 72px`, `right: 16px` |
| **Size** | **56px × 56px** (minimum touch target) |
| **z-index** | Above all content, below modals only |
| **Icon** | CoAIleague Trinity convergence mark — NOT a generic sparkle |
| **Gradient** | `linear-gradient(135deg, #0D9488 0%, #0891B2 100%)` |
| **Shadow** | `0 4px 20px rgba(13,148,136,0.35)` |
| **Animation** | Subtle pulse idle (2s cycle, 1.05 scale), ripple on press |
| **Safe area** | `calc(72px + env(safe-area-inset-bottom, 0px))` |
| **Badge** | Notification dot if Trinity has pending proactive alert |

### One-FAB-Per-Screen Rule
**Mobile:** One unified FAB only. The QuickActions FAB IS the Trinity FAB — branded with TrinityLogo, expands to show "Ask Trinity" as featured first action plus Clock In/Out, Messages, Schedule, Time Off.
**Desktop:** Standalone TrinityAmbientFAB bottom-right. No QuickActions FAB on desktop.

### Bottom Sheet

| Property | Value |
|----------|-------|
| **Max height** | 85vh |
| **Default height** | 50vh (split mode) |
| **Min height** | ~25vh (peek mode) |
| **User-draggable** | Yes — drag up to expand, drag down to minimize/close |
| **Border radius** | 16px top corners only |
| **Keyboard-aware** | Sheet pushes up when soft keyboard opens |
| **Safe area** | Respects device bottom inset (notch/home bar) |
| **Background** | `hsl(var(--card))` — NOT hardcoded white |
| **Backdrop** | Semi-transparent dark overlay, tappable to dismiss |

---

## 6. Developer Acceptance Criteria — ENFORCED

### 6.1 Visual Verification (Required Before Every PR)
- [ ] Test at 360px viewport width (minimum Android screen)
- [ ] Test at 390px viewport width (iPhone standard)
- [ ] Screenshot FAB placement on: Home, Schedule, Clock, Mail, More screens
- [ ] Screenshot Trinity bottom sheet open on 360px screen showing correct sizing
- [ ] No FAB overlapping any data cards, buttons, or nav elements

### 6.2 Functional Verification
- [ ] Zero React hook errors in browser console
- [ ] Zero unhandled promise rejections from Trinity API calls
- [ ] Token usage logged per `org_id` on every Trinity request
- [ ] Fallback chain tested: disable Gemini → Claude activates; disable Claude → OpenAI activates
- [ ] Bottom sheet keyboard behavior tested on iOS and Android

### 6.3 Performance
- [ ] Trinity first response < 3 seconds on standard LTE
- [ ] Bottom sheet open animation < 300ms
- [ ] FAB render does not cause layout shift on page load

---

## 7. Future Expansion

- **Inbound Email Processing** — auto-processes calloffs@, incidents@, docs@, support@ via Resend
- **Proactive Intelligence** — Trinity initiates when detecting anomalies (missed punch, coverage gap, expiring license)
- **Voice Mode** — Push-to-talk for officers in the field who cannot type
- **Incident Bot Expansion** — Full structured docs with photos, witness statements, auto-routing
- **Client Portal Trinity** — Client-facing permissions for coverage checks, reports, requests
- **Trinity Analytics Dashboard** — All Trinity interactions, token costs by category, escalation patterns

---

## Implementation Constants (Developer Reference)

```
FAB size:        56px × 56px
FAB bottom:      72px + env(safe-area-inset-bottom, 0px)
FAB right:       16px
FAB gradient:    linear-gradient(135deg, #0D9488 0%, #0891B2 100%)
FAB shadow:      0 4px 20px rgba(13,148,136,0.35)
Sheet max:       85vh
Sheet default:   50vh (split mode)
Sheet peek:      ~25vh
Sheet bg:        hsl(var(--card))
```

## Codebase Notes

- **Brand colors** — Always hardcoded inline, never Tailwind color classes
- **Hook law** — All hooks unconditionally at top → THEN early returns → THEN logic/JSX
- **No new files** — Extend existing files unless genuinely warranted
- **Seed constants** — `ACME = 'dev-acme-security-ws'`, 8 core employees `dev-acme-emp-004..013`
- **DB law** — No DROP TABLE. `audit_action` stays as `text`. Use `psql $DATABASE_URL`, never `npm run db:push`
