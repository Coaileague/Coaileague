import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Globe, Mail, Shield, CheckCircle, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CONTACTS, DOMAINS } from "@shared/platformConfig";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: string;
  purpose: string;
}

const MX_RECORDS: DnsRecord[] = [
  {
    type: "MX",
    name: "@",
    value: "feedback-smtp.us-east-1.amazonses.com",
    ttl: "300",
    purpose: "Inbound mail routing via Resend",
  },
];

const DKIM_RECORDS: DnsRecord[] = [
  {
    type: "TXT",
    name: "resend._domainkey",
    value: "v=DKIM1; k=rsa; p=<DKIM_PUBLIC_KEY from Resend dashboard>",
    ttl: "300",
    purpose: "Email authentication (DKIM signing)",
  },
];

const SPF_RECORDS: DnsRecord[] = [
  {
    type: "TXT",
    name: "@",
    value: "v=spf1 include:amazonses.com ~all",
    ttl: "300",
    purpose: "SPF policy — allows Resend/SES to send on behalf of coaileague.com",
  },
];

const DMARC_RECORDS: DnsRecord[] = [
  {
    type: "TXT",
    name: "_dmarc",
    value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOMAINS.root}; ruf=mailto:dmarc-forensic@${DOMAINS.root}; pct=100`,
    ttl: "3600",
    purpose: "DMARC policy — quarantine unauthenticated email",
  },
];

const INBOUND_WEBHOOK = "https://api.resend.com/webhooks/inbound";
const INBOUND_ENDPOINT = "/api/inbound/email";

export default function DnsSetupGuide() {
  const { toast } = useToast();

  const copyValue = (value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  };

  const DnsTable = ({ records, title, badgeLabel }: { records: DnsRecord[]; title: string; badgeLabel: string }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-sm">{title}</h3>
        <Badge variant="outline" className="text-xs">{badgeLabel}</Badge>
      </div>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16">Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Name</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16">TTL</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Badge variant="secondary" className="text-xs font-mono">{rec.type}</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{rec.name}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">{rec.value}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{rec.ttl}s</td>
                <td className="px-3 py-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid={`button-copy-dns-${i}`}
                    onClick={() => copyValue(rec.value)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
          {records[0]?.purpose}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-dns-guide-title">DNS Setup Guide</h1>
        <p className="text-muted-foreground mt-1">
          Required DNS records to enable the coaileague.com platform email system.
          Add these records at your DNS provider (Cloudflare, Route53, etc.).
        </p>
      </div>

      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-yellow-600 dark:text-yellow-400">Before you begin</p>
              <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                <li>Get the DKIM public key from the Resend dashboard under "Domains"</li>
                <li>DNS changes can take up to 48 hours to propagate globally</li>
                <li>Verify each record with <code className="text-xs bg-muted px-1 py-0.5 rounded">dig</code> or MXToolbox before going live</li>
                <li>Verify each DNS record is active before cutting over inbound routing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: MX Records */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            <Mail className="w-4 h-4" />
            MX Records — Inbound Mail Routing
          </CardTitle>
          <CardDescription>Route incoming mail to Resend's inbound processing infrastructure.</CardDescription>
        </CardHeader>
        <CardContent>
          <DnsTable records={MX_RECORDS} title="Inbound MX" badgeLabel="Required" />
        </CardContent>
      </Card>

      {/* Step 2: SPF */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            <Shield className="w-4 h-4" />
            SPF Record — Sender Policy Framework
          </CardTitle>
          <CardDescription>Authorize Resend/Amazon SES to send email on behalf of coaileague.com.</CardDescription>
        </CardHeader>
        <CardContent>
          <DnsTable records={SPF_RECORDS} title="SPF Policy" badgeLabel="Required" />
        </CardContent>
      </Card>

      {/* Step 3: DKIM */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            <Shield className="w-4 h-4" />
            DKIM Record — DomainKeys Identified Mail
          </CardTitle>
          <CardDescription>
            Cryptographically sign outbound email. Get the public key from Resend → Domains → coaileague.com.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DnsTable records={DKIM_RECORDS} title="DKIM Signing" badgeLabel="Required" />
        </CardContent>
      </Card>

      {/* Step 4: DMARC */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
            <Globe className="w-4 h-4" />
            DMARC Record — Domain Policy
          </CardTitle>
          <CardDescription>Set your domain's email authentication policy and receive reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <DnsTable records={DMARC_RECORDS} title="DMARC Policy" badgeLabel="Recommended" />
        </CardContent>
      </Card>

      {/* Step 5: Inbound Webhook */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
            <Globe className="w-4 h-4" />
            Resend Inbound Webhook Configuration
          </CardTitle>
          <CardDescription>Configure Resend to forward inbound emails to the CoAIleague platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">In the Resend dashboard:</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Go to <strong>Domains → coaileague.com → Inbound</strong></li>
              <li>Enable inbound email handling</li>
              <li>Set the webhook URL to your platform endpoint below</li>
              <li>Set catch-all routing to forward to the webhook</li>
            </ol>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Webhook endpoint (production URL)</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono flex-1 text-foreground">
                https://app.coaileague.com{INBOUND_ENDPOINT}
              </code>
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-copy-webhook-url"
                onClick={() => copyValue(`https://app.coaileague.com${INBOUND_ENDPOINT}`)}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Verification Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              "MX record resolves to feedback-smtp.us-east-1.amazonses.com",
              "SPF record includes 'include:amazonses.com'",
              "DKIM selector 'resend._domainkey' returns public key",
              "DMARC record present with p=quarantine or p=reject",
              `Test inbound email: send to staffing@${DOMAINS.root}, confirm it hits /api/inbound/email`,
              "Test outbound: Trinity sends email, Resend dashboard shows delivery",
              `Confirm inbound routing is live on ${DOMAINS.root} before disabling legacy routing`,
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
