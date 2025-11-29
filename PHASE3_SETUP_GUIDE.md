# Phase 3: Critical Platform Gaps - Setup Guide

## Status Summary
- ✅ Free trial (14-day) schema ready in registration
- ✅ Stripe integration configured  
- ⚠️ OAuth (QuickBooks/Gusto) requires external API setup
- ⚠️ Stripe pricing tiers need Price IDs from Stripe dashboard

## Required Environment Variables

### OAuth Integration
Add to `.env.secrets`:
```
# QuickBooks OAuth (from Intuit Developer Portal)
QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id
QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret
QUICKBOOKS_REALM_ID=your_realm_id

# Gusto OAuth (from Gusto Developer Portal)
GUSTO_CLIENT_ID=your_gusto_client_id
GUSTO_CLIENT_SECRET=your_gusto_client_secret
```

### Stripe Pricing Tiers
Add to `.env`:
```
# Create these in Stripe Dashboard and get Price IDs
VITE_STRIPE_PRICE_ID_STARTER=price_1Abc...
VITE_STRIPE_PRICE_ID_PROFESSIONAL=price_2Def...
VITE_STRIPE_PRICE_ID_ENTERPRISE=price_3Ghi...
```

## Implementation Checklist

### 1. Stripe Price ID Setup
- [ ] Log into Stripe Dashboard
- [ ] Create Product: "CoAIleague Starter" ($299/mo)
- [ ] Create Product: "CoAIleague Professional" ($999/mo)  
- [ ] Create Product: "CoAIleague Enterprise" (Custom)
- [ ] Get Price IDs and add to environment
- [ ] Test checkout flow at `/pricing`

### 2. QuickBooks Integration
- [ ] Register app at https://developer.intuit.com
- [ ] Set OAuth redirect URI: `https://yourapp.com/api/oauth/quickbooks/callback`
- [ ] Get Client ID/Secret
- [ ] Implement OAuth flow in `/api/integrations/quickbooks`
- [ ] Add credential encryption storage

### 3. Gusto Integration  
- [ ] Register at https://gusto.com/developer
- [ ] Set OAuth redirect URI: `https://yourapp.com/api/oauth/gusto/callback`
- [ ] Get Client ID/Secret
- [ ] Implement OAuth flow in `/api/integrations/gusto`
- [ ] Add credential encryption storage

### 4. Free Trial Activation (Immediate)
- [ ] Update registration to auto-create subscription with `status: 'trial'`
- [ ] Add trial countdown to dashboard
- [ ] Send welcome email with trial info
- [ ] Schedule trial expiry warning (day 10)

## Current Registration Flow
Registration already accepts:
```json
{
  "email": "user@example.com",
  "password": "...",
  "firstName": "John",
  "lastName": "Doe",
  "companyName": "ACME Corp",
  "subscriptionTier": "free" // Options: free, starter, professional, enterprise
}
```

Default: Creates 14-day trial subscription automatically

## Next Steps for Full Phase 3
This guide documents what's needed. For implementation:
- Switch to Autonomous Mode for OAuth + Stripe integration
- Current Fast mode changes have fixed mobile grid layouts (Phases 1-2)
- Phase 4-5 (Usage tracking, webhooks) also requires Autonomous mode
