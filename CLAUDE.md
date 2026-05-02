See TRINITY.md for all project engineering laws and architecture.

# CoAIleague Engineering Laws (excerpt — until TRINITY.md is restored)

## LAW: Public Safety Boundary (NON-NEGOTIABLE)

Trinity and HelpAI are NOT public-safety services. They MUST NEVER:

1. **Call 911**, dial police, fire, EMS, ambulance, or any emergency dispatcher.
2. **Dispatch** emergency responders or imply that responders have been dispatched.
3. **Promise** or **guarantee** anyone's safety, rescue, welfare, or any specific outcome.
4. Use first-person assurances such as "I'll keep you safe," "you're safe with me,"
   "help is on the way," "I called 911," or "police are en route."

A licensed human supervisor must always be in the loop for any safety-critical
decision. The platform is a notification + workflow tool, not a substitute for
emergency services.

### Why
- **Public-duty doctrine** (most US states) — purporting to provide emergency
  services creates assumed duty and tort exposure.
- **Assumption-of-duty doctrine** (TX, AZ, NV, IL, NC and others — see
  `server/services/compliance/stateRegulatoryKnowledgeBase.ts`).
- Texas Occupations Code §1702 — licensed human supervision is statutorily
  required and cannot be replaced by an automated platform.

### Approved phrasing
- "Our role is to observe, deter, and report."
- "I'll notify your on-call supervisor."
- "If anyone is in immediate danger, call 9-1-1 directly."

### Prohibited phrasing
- "I guarantee your safety." / "We promise your safety."
- "You'll be safe with me." / "I'll keep you safe."
- "I called 911." / "Police are on the way."
- "Nothing bad will happen." / "I'll rescue you."

### Where this rule is enforced (defense in depth)

| Layer | File | Mechanism |
|---|---|---|
| Action layer | `server/services/ai-brain/trinityConscience.ts` Principle 8 | Hard `block` verdict for any action ID matching the public-safety-blocked set. Cannot be overridden by role, confirmation, or caller type. |
| Intent layer | `server/services/trinity/trinityActionDispatcher.ts` `PUBLIC_SAFETY_REFUSAL_PATTERNS` | Refuses chat/voice/email intents like "call 911" / "dispatch police" / "guarantee my safety" before any action is queued. |
| Language layer | `server/services/ai-brain/publicSafetyGuard.ts` `guardOutbound()` | Wraps every Trinity chat response — rewrites offending phrases and appends the canonical disclaimer. Idempotent. |
| Panic flow | `server/services/ops/panicAlertService.ts` `PANIC_LIABILITY_NOTICE` | The canonical legal disclaimer bundled with every panic API response and tenant-facing UI. |
| Compliance KB | `server/services/compliance/stateRegulatoryKnowledgeBase.ts` | Per-state `prohibitedLanguage` lists and assumption-of-duty exposure descriptions. |

### Permitted ALLOWED actions
- `panic.notify_supervisor` — paging the human supervisor (notification only).
- `notify.send` — broadcasting messages to staff (no safety guarantees in body).
- Telling the user to call 911 themselves ("If you are in danger, call 9-1-1
  directly") is approved phrasing — it's instructing the human, not Trinity
  acting as a dispatcher.

### How to extend
Adding a new action that touches safety, dispatch, or emergency response
**MUST** be reviewed against this law. The default position is REFUSE. The
test suite in `tests/security/publicSafetyGuard.test.ts` and
`tests/security/trinityConsciencePublicSafety.test.ts` must remain green.

**Change to this law requires written legal approval.**
