# AI Brain Skills System

## Overview

The AI Brain Skills System is a pluggable, modular architecture that extends AutoForce™'s AI capabilities. Each skill is a self-contained module that can:

- Execute AI-powered tasks (OCR, analytics, scheduling, etc.)
- Subscribe to system events
- Expose API endpoints
- Enforce RBAC and tier gating
- Hot-reload during development

## Creating a New Skill

### 1. Create Skill Directory

```bash
mkdir -p server/services/ai-brain/skills/my-skill
```

### 2. Implement Skill Class

Create `server/services/ai-brain/skills/my-skill/index.ts`:

```typescript
import { BaseSkill } from '../base-skill';
import type { SkillManifest, SkillContext, SkillResult } from '../types';

export default class MySkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'my-skill',
      name: 'My Awesome Skill',
      version: '1.0.0',
      description: 'Does something amazing',
      author: 'AutoForce Team',
      category: 'intelligence',
      requiredTier: 'professional', // Optional tier gating
      capabilities: ['analyze', 'predict'],
      apiEndpoints: ['/api/ai/my-skill'],
    };
  }

  async execute(context: SkillContext, params: any): Promise<SkillResult> {
    try {
      // Your skill logic here
      const result = await this.doSomething(params);

      return {
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async doSomething(params: any) {
    // Implementation
    return { foo: 'bar' };
  }
}
```

### 3. Skill Auto-Discovery

Skills are automatically discovered and loaded on server startup. No manual registration required!

## Skill Categories

- **analytics**: Predictive analytics, forecasting, insights
- **automation**: Task automation, workflow automation
- **communication**: Email, SMS, notifications
- **document-processing**: OCR, PDF generation, document parsing
- **intelligence**: AI insights, recommendations
- **integration**: Third-party integrations
- **scheduling**: Scheduling optimization, conflict resolution
- **compliance**: Compliance monitoring, audit trails
- **reporting**: Report generation, data visualization

## RBAC & Tier Gating

Skills can enforce access control:

```typescript
getManifest(): SkillManifest {
  return {
    // ...
    requiredTier: 'professional', // Requires Professional tier or higher
    requiredRole: ['org_owner', 'org_admin'], // Requires specific roles
  };
}
```

## Event System

Skills can emit and subscribe to events:

```typescript
// Emit an event
await this.emit('document.processed', {
  skillId: 'document-ocr',
  eventType: 'document.processed',
  payload: { documentId: '123' },
  timestamp: new Date(),
  context,
});

// Subscribe to events
protected async onEvent(event: SkillEvent): Promise<void> {
  if (event.eventType === 'schedule.created') {
    // Handle schedule creation
  }
}
```

## API Integration

Skills can expose API endpoints by specifying them in the manifest:

```typescript
getManifest(): SkillManifest {
  return {
    // ...
    apiEndpoints: ['/api/ai/my-skill'],
  };
}
```

Then register route handlers in `server/routes.ts` that call the skill:

```typescript
app.post('/api/ai/my-skill', requireAuth, async (req, res) => {
  const context = buildSkillContext(req);
  const result = await skillRegistry.executeSkill('my-skill', context, req.body);
  
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

## Example Skills

### Document OCR Skill

```
skills/document-ocr/
  index.ts      - Main skill class
  gemini.ts     - Gemini Vision API integration
  types.ts      - OCR-specific types
```

### Predictive Analytics Skill

```
skills/predictive-analytics/
  index.ts              - Main skill class
  revenue-forecast.ts   - Revenue forecasting logic
  demand-prediction.ts  - Demand prediction logic
  types.ts              - Analytics types
```

## Hot Reload (Development)

In development mode, skills automatically reload when files change:

```bash
# Edit your skill
vim server/services/ai-brain/skills/my-skill/index.ts

# Skill auto-reloads on save
# No server restart needed!
```

## Testing Skills

```typescript
import { skillRegistry } from './skill-registry';

const context = {
  userId: 'test-user',
  workspaceId: 'test-workspace',
  subscriptionTier: 'professional',
};

const result = await skillRegistry.executeSkill(
  'my-skill',
  context,
  { input: 'test' }
);

console.log(result);
```

## Health Monitoring

Check skill system health:

```typescript
const health = await skillRegistry.getHealth();
console.log(health);
// {
//   totalSkills: 5,
//   healthySkills: 4,
//   unhealthySkills: ['broken-skill']
// }
```

## Best Practices

1. **Keep skills focused** - One skill, one responsibility
2. **Use RBAC** - Protect sensitive operations with tier/role requirements
3. **Handle errors gracefully** - Always return structured SkillResult
4. **Log extensively** - Use console.log for debugging
5. **Version carefully** - Increment version when breaking changes occur
6. **Document well** - Add JSDoc comments to public methods
7. **Test thoroughly** - Write unit tests for skill logic

## Roadmap

Future enhancements:
- [ ] Skill marketplace
- [ ] Skill dependencies resolution
- [ ] Skill sandboxing
- [ ] Skill usage analytics
- [ ] Skill rate limiting
- [ ] Skill versioning and updates
