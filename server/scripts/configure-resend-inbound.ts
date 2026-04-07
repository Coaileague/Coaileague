/**
 * Configure Resend Inbound Email
 * 
 * This script uses the Resend API to:
 * 1. Create a webhook for inbound email processing
 * 2. Verify domain configuration
 * 
 * Run with: npx tsx server/scripts/configure-resend-inbound.ts
 */

import { getUncachableResendClient } from '../services/emailCore';

const WEBHOOK_URL = process.env.REPLIT_DOMAINS 
  ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/api/webhooks/resend/inbound`
  : 'https://coaileague.com/api/webhooks/resend/inbound';

// Use root domain for inbound (MX record on coaileague.com)
const INBOUND_DOMAIN = 'coaileague.com';
const MAIN_DOMAIN = 'coaileague.com';

interface ResendWebhook {
  id: string;
  endpoint_url: string;
  events: string[];
}

interface ResendDomain {
  id: string;
  name: string;
  status: string;
  region: string;
  records: Array<{
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }>;
}

async function getResendApiKey(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Replit credentials not available');
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );

  const data = await response.json();
  const settings = data.items?.[0]?.settings;
  
  if (!settings?.api_key) {
    throw new Error('Resend API key not found');
  }

  return settings.api_key;
}

async function listWebhooks(apiKey: string): Promise<ResendWebhook[]> {
  const response = await fetch('https://api.resend.com/webhooks', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list webhooks: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function createWebhook(apiKey: string, endpointUrl: string, events: string[]): Promise<ResendWebhook> {
  const response = await fetch('https://api.resend.com/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint: endpointUrl,
      events: events
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create webhook: ${response.statusText} - ${error}`);
  }

  return response.json();
}

async function listDomains(apiKey: string): Promise<ResendDomain[]> {
  const response = await fetch('https://api.resend.com/domains', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list domains: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function getDomain(apiKey: string, domainId: string): Promise<ResendDomain> {
  const response = await fetch(`https://api.resend.com/domains/${domainId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get domain: ${response.statusText}`);
  }

  return response.json();
}

async function verifyDomain(apiKey: string, domainId: string): Promise<any> {
  const response = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to verify domain: ${response.statusText} - ${error}`);
  }

  return response.json();
}

async function addDomain(apiKey: string, domainName: string): Promise<ResendDomain> {
  const response = await fetch('https://api.resend.com/domains', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: domainName
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add domain: ${response.statusText} - ${error}`);
  }

  return response.json();
}

async function main() {
  console.log('='.repeat(60));
  console.log('RESEND INBOUND EMAIL CONFIGURATION');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Main Domain: ${MAIN_DOMAIN} (Google Workspace)`);
  console.log(`Inbound Domain: ${INBOUND_DOMAIN} (Resend)`);
  console.log('');

  try {
    // Get API key
    console.log('[1/5] Getting Resend API key...');
    const apiKey = await getResendApiKey();
    console.log('    API key retrieved successfully');
    console.log('');

    // List domains
    console.log('[2/5] Checking domains...');
    let domains: ResendDomain[] = [];
    try {
      domains = await listDomains(apiKey);
      console.log(`    Found ${domains.length} domain(s):`);
      domains.forEach(d => console.log(`      - ${d.name} [${d.status}]`));
    } catch (error: any) {
      console.log(`    Note: Domain API requires full access key`);
    }
    console.log('');

    // Check for inbound subdomain
    console.log('[3/5] Checking inbound subdomain...');
    let inboundDomain = domains.find(d => d.name === INBOUND_DOMAIN);
    
    if (!inboundDomain) {
      console.log(`    Subdomain ${INBOUND_DOMAIN} not found - adding it...`);
      try {
        inboundDomain = await addDomain(apiKey, INBOUND_DOMAIN);
        console.log(`    Added ${INBOUND_DOMAIN} successfully!`);
      } catch (error: any) {
        console.log(`    Could not add domain: ${error.message}`);
        console.log(`    Add manually: Resend Dashboard > Domains > Add Domain > ${INBOUND_DOMAIN}`);
      }
    } else {
      console.log(`    Found ${INBOUND_DOMAIN} [${inboundDomain.status}]`);
    }

    // Get DNS records if domain exists
    if (inboundDomain) {
      try {
        const domainDetails = await getDomain(apiKey, inboundDomain.id);
        console.log('');
        console.log('    DNS Records Required for Resend:');
        domainDetails.records?.forEach(record => {
          console.log(`      ${record.type} ${record.name}: ${record.value.substring(0, 50)}... [${record.status}]`);
        });
        
        // Trigger verification
        console.log('');
        console.log('    Triggering domain verification...');
        await verifyDomain(apiKey, inboundDomain.id);
        console.log('    Verification triggered');
      } catch (error: any) {
        console.log(`    Note: ${error.message}`);
      }
    }
    console.log('');

    // List existing webhooks
    console.log('[4/5] Checking existing webhooks...');
    let webhooks: ResendWebhook[] = [];
    try {
      webhooks = await listWebhooks(apiKey);
      console.log(`    Found ${webhooks.length} webhook(s)`);
      webhooks.forEach(w => {
        console.log(`      - ${w.endpoint_url}`);
        console.log(`        Events: ${w.events.join(', ')}`);
      });
    } catch (error: any) {
      console.log(`    Note: Could not list webhooks - ${error.message}`);
    }
    
    const existingInboundHook = webhooks.find(w => 
      w.endpoint_url.includes('/api/webhooks/resend')
    );
    console.log('');

    // Create webhook if not exists
    console.log('[5/5] Configuring email webhook...');
    if (!existingInboundHook) {
      console.log(`    Creating webhook: ${WEBHOOK_URL}`);
      
      try {
        const newWebhook = await createWebhook(apiKey, WEBHOOK_URL, [
          'email.sent',
          'email.delivered',
          'email.bounced',
          'email.complained',
          'email.opened',
          'email.clicked'
        ]);
        
        console.log(`    Webhook created successfully!`);
        console.log(`    ID: ${newWebhook.id}`);
      } catch (error: any) {
        console.log(`    Note: ${error.message}`);
        console.log(`    Create webhook manually in Resend Dashboard`);
      }
    } else {
      console.log('    Webhook already configured');
    }
    console.log('');

    console.log('='.repeat(60));
    console.log('CONFIGURATION COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log('REQUIRED DNS RECORD (add in Replit DNS):');
    console.log('');
    console.log('  Type: MX');
    console.log('  Name: mail');
    console.log('  Value: inbound-smtp.resend.com');
    console.log('  Priority: 10');
    console.log('');
    console.log('Next steps:');
    console.log(`1. Add MX record above for ${INBOUND_DOMAIN}`);
    console.log('2. Wait for DNS propagation (5-10 minutes)');
    console.log('3. Enable Receiving in Resend Dashboard for coaileague.com');
    console.log(`4. Send a test email to staffing@${INBOUND_DOMAIN}`);
    console.log('');
    console.log(`Webhook URL: ${WEBHOOK_URL}`);
    console.log(`Test email: staffing@${INBOUND_DOMAIN}`);

  } catch (error: any) {
    console.error('');
    console.error('ERROR:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Verify Resend integration is connected in Replit');
    console.error('2. Check API key has webhook permissions');
    console.error('3. Ensure domain is added in Resend Dashboard');
    process.exit(1);
  }
}

main();
