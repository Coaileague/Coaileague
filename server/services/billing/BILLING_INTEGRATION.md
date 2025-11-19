# AutoForce™ Billing Integration - Credit-Only Model

## Overview

AutoForce™ uses a **credit-only billing model** to ensure customers are never double-charged.

## Primary Billing: Credit System

**How it works:**
1. Users purchase monthly/yearly subscriptions (Free, Starter, Professional, Enterprise)
2. Each tier includes monthly credit allocation:
   - Free: 100 credits/month
   - Starter: 500 credits/month
   - Professional: 2,000 credits/month
   - Enterprise: 10,000 credits/month
3. Users can buy additional credit packs anytime (100 credits = $10, up to 100K credits = $2,000)
4. AI automations deduct credits when they run:
   - AI Scheduling: 25 credits
   - AI Invoice: 10 credits
   - AI Payroll: 15 credits
   - AI Chat: 5 credits
   - AI Analytics: 12 credits

**Implementation:**
- `creditManager.ts` - Manages credit balance, deductions, purchases
- `creditWrapper.ts` - Wraps automations with credit checks/deductions
- `subscriptionManager.ts` - Manages Stripe subscriptions and credit allocations

## Analytics Only: Cost Aggregation

**Purpose:** Internal tracking and reporting ONLY - NOT for billing

**What it tracks:**
1. ✅ **AI token usage** - For internal cost analysis and profit margin tracking
2. ✅ **Partner API costs** - QuickBooks, Gusto, Stripe API call costs
3. ✅ **Tier-based markup** - Theoretical pricing for analytics

**What it does NOT do:**
- ❌ Does NOT generate customer invoices for AI usage (credits already cover this)
- ❌ Does NOT charge customers for AI tokens

**Implementation:**
- `usageMetering.ts` - Records all usage events for analytics
- `costAggregation.ts` - Aggregates costs for internal reporting
- Used by platform admins to analyze profit margins and optimize pricing

## Why This Design?

### Prevents Double-Billing
- **Credits** = Customer-facing billing (simple, predictable)
- **Cost Aggregation** = Internal analytics (detailed, accurate)
- No overlap between the two systems

### Benefits
1. **Simple for customers** - Buy credits, use features, done
2. **Flexible pricing** - Can adjust credit costs without changing Stripe prices
3. **Accurate tracking** - Know real costs vs. revenue
4. **Scalable** - Can add new features without modifying billing logic

## Weekly Overage Billing (Future Feature)

**NOT IMPLEMENTED YET** - For reference only

If a workspace exceeds their monthly credit allocation significantly:
- Weekly billing for credit purchases beyond base subscription
- Handled via Stripe's usage-based billing
- Credits are purchased on-demand, not invoiced separately

## Partner API Costs (Separate Billing)

Partner API costs (QuickBooks, Gusto) are **separate from credits**:
- Not covered by monthly subscription
- Billed separately via Stripe invoices
- Uses cost aggregation to calculate monthly charges
- Transparent pass-through pricing with tier-based markup

## Code Integration

### When Adding New AI Features

```typescript
import { withCredits } from './services/billing/creditWrapper';

// Wrap your automation
const result = await withCredits({
  workspaceId,
  featureKey: 'ai_new_feature', // Add to CREDIT_COSTS
  description: 'Generated new feature output',
  userId,
}, async () => {
  // Your AI automation logic
  return await myAIFeature.generate();
});

if (result.insufficientCredits) {
  return { error: 'Out of credits' };
}

return result.result;
```

### When Tracking Costs

```typescript
// Usage metering automatically tracks token costs
// Gemini client records all token usage
// No action needed - it's automatic!
```

## Summary

**Customer pays:** Credits (via subscription + credit packs)  
**Platform tracks:** Actual costs (for analytics)  
**No double billing:** Credits cover AI, separate billing for partner APIs  
**Simple & transparent:** Clear pricing, easy to understand
