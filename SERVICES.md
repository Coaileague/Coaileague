# CoAIleague Service Directory

## AI Services

### ai-brain/
Trinity's core reasoning system. Trinity is one unified AI agent; this
folder holds the internal compute-path routing that dispatches her
reasoning across multiple interchangeable model backends (orchestration,
specialist, support). The backends are implementation details, not
separate agents — every surface always speaks as Trinity.
- Internal path routing and fallback chains
- Cost tracking and credit management
- Response caching and optimization

### helpai/
Trinity's in-app support channel
- IRC-style response pattern (responds to all messages except acknowledgments)
- Unified bot service: `helpAIBotService.ts`
- Domain-specific expertise routing

### trinity/
Trinity AI subsystem
- Platform orchestration
- Proactive monitoring and alerts
- User interaction personalization

### orchestration/
AI model orchestration layer
- Multi-model routing
- Confidence scoring
- Fallback chain management

## Business Operations

### billing/
Complete billing and invoicing system
- Invoice generation and PDF export
- Stripe payment processing
- Credit management and usage metering
- AI token billing

### payrollService.ts
Automated payroll processing
- Multi-state compliance
- Tax calculations
- QuickBooks integration

### partners/
Partner management and integrations
- QuickBooks sync service
- Third-party API integrations

## Workforce Management

### scheduleService.ts
Core shift scheduling
- Recurring shifts
- Shift templates
- Conflict detection

### autonomousScheduler.ts
AI-powered autonomous scheduling
- Demand prediction
- Optimal shift assignment
- Cost optimization

### timesheetService.ts
Timesheet tracking
- GPS-verified clock-in/out
- Break management
- Overtime calculations

### employeeService.ts
Employee management
- Onboarding workflows
- Role assignments
- Document management

## Support & HelpDesk

### helpai/helpAIBotService.ts
Unified HelpAI bot service
- IRC-style response pattern
- Multi-domain expertise
- Real-time WebSocket integration

### helposService/
HelpOS queue management
- Priority routing
- SLA tracking
- Agent assignment

### supportTicketService.ts
Support ticket system
- Ticket lifecycle management
- Assignment and escalation
- Integration with helpai

## Analytics & Reporting

### analytics/
Analytics data processing
- Usage metrics
- Performance tracking
- Business intelligence

### businessOwnerAnalyticsService.ts
Owner-focused analytics
- Revenue dashboards
- Cost analysis
- ROI tracking

## Compliance & Security

### compliance/
Compliance monitoring system
- 50-state labor law compliance
- Certification tracking
- HR alerts

### audit-logger.ts
SOX-compliant audit logging
- Action tracking
- Data change history
- Security events

## Infrastructure

### infrastructure/
System monitoring and health
- Health checks
- Performance metrics
- Error tracking

### ChatServerHub.ts
Unified chat gateway
- WebSocket management
- AI Brain integration
- Real-time notifications

### websocket.ts
WebSocket server (6,086 lines)
- Chat messaging
- Presence management
- Room handling

## Integrations

### integrations/
Third-party service integrations
- HRIS providers
- OAuth management
- API adapters

### oauth/
OAuth authentication providers
- Token management
- Session handling
- Multi-provider support

### stripeService.ts
Stripe payment integration
- Payment processing
- Subscription management
- Invoice handling

## Service Dependencies

```
User Request
    |
helpai/helpAIBotService.ts
    |
ai-brain/
    |
orchestration/
    |
[Gemini/Claude/GPT APIs]

billing/ --> stripeService.ts --> [Stripe API]
    |
    +--> partners/quickbooksSyncService.ts --> [QuickBooks API]
```

## Key Entry Points

- WebSocket: `server/websocket.ts`
- HTTP Routes: `server/routes.ts`
- Storage: `server/storage.ts`
- Schema: `shared/schema.ts`
