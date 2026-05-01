/**
 * Accounting Integrations - Connect with accounting software
 *
 * Current behavior:
 * - QuickBooks routes into the direct setup flow
 * - Xero submits a platform-reviewed connection request
 * - Other providers can be requested from the page and tracked by the platform team
 */

import { useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { useToast } from "@/hooks/use-toast";
import { 
  Link2, Check, ExternalLink, Settings, RefreshCw,
  Calculator, Building2, Briefcase, FileSpreadsheet, ArrowRight
} from "lucide-react";
import { SiQuickbooks, SiXero } from "react-icons/si";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface AccountingIntegration {
  id: string;
  name: string;
  description: string;
  icon: any;
  iconColor: string;
  features: string[];
  status: 'connected' | 'available' | 'coming_soon';
  website?: string;
}

const INTEGRATIONS: AccountingIntegration[] = [
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    description: 'Sync payroll data, invoices, and expenses with QuickBooks Online for seamless accounting',
    icon: SiQuickbooks,
    iconColor: 'text-green-600 dark:text-green-400',
    features: [
      'Automatic payroll sync',
      'Invoice generation & sync',
      'Expense categorization',
      'Employee data sync',
      'Real-time financial reports',
    ],
    status: 'available',
    website: 'https://quickbooks.intuit.com',
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Connect with Xero for comprehensive payroll and accounting integration',
    icon: SiXero,
    iconColor: 'text-blue-500 dark:text-blue-400',
    features: [
      'Bi-directional payroll sync',
      'Bill payments automation',
      'Bank reconciliation',
      'Multi-currency support',
      'Custom chart of accounts',
    ],
    status: 'available',
    website: 'https://www.xero.com',
  },
  {
    id: 'freshbooks',
    name: 'FreshBooks',
    description: 'Integrate with FreshBooks for time tracking and invoicing automation',
    icon: Calculator,
    iconColor: 'text-blue-600 dark:text-blue-400',
    features: [
      'Time tracking sync',
      'Automatic invoicing',
      'Expense management',
      'Project billing',
      'Client management',
    ],
    status: 'coming_soon',
    website: 'https://www.freshbooks.com',
  },
  {
    id: 'wave',
    name: 'Wave Accounting',
    description: 'Free accounting software integration for small business payroll',
    icon: FileSpreadsheet,
    iconColor: 'text-cyan-600',
    features: [
      'Basic payroll sync',
      'Receipt scanning',
      'Financial reports',
      'Invoice management',
      'Payment processing',
    ],
    status: 'coming_soon',
    website: 'https://www.waveapps.com',
  },
];

const Icon = ({ name, className }: any) => <span className={className}>●</span>;

export default function AccountingIntegrations() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<AccountingIntegration | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestedIntegrationName, setRequestedIntegrationName] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const handleConnect = (integration: AccountingIntegration) => {
    if (integration.id === 'quickbooks') {
      setLocation('/quickbooks-import');
      return;
    }
    setSelectedIntegration(integration);
    setConnectDialogOpen(true);
  };

  const openRequestDialog = (integrationName = '') => {
    setRequestedIntegrationName(integrationName);
    setRequestNotes('');
    setRequestDialogOpen(true);
  };

  const handleSubmitConnection = async () => {
    if (!selectedIntegration || !apiKey.trim()) return;

    setIsConnecting(true);
    try {
      const res = await apiRequest('POST', '/api/integrations/connection-request', {
        integrationId: selectedIntegration.id,
        integrationName: selectedIntegration.name,
        apiKey: apiKey.trim(),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to submit connection request');
      }

      toast({
        title: 'Connection Request Submitted',
        description: `Your ${selectedIntegration.name} integration request has been submitted. Our team will verify and activate it within 24-48 business hours.`,
      });

      setConnectDialogOpen(false);
      setApiKey('');
      setSelectedIntegration(null);
    } catch (err: unknown) {
      toast({
        title: 'Submission Failed',
        description: err?.message || 'Could not submit your connection request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSubmitIntegrationRequest = async () => {
    const integrationName = requestedIntegrationName.trim();
    if (!integrationName) return;

    setIsSubmittingRequest(true);
    try {
      const integrationId = `custom-request-${integrationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      const res = await apiRequest('POST', '/api/integrations/connection-request', {
        integrationId,
        integrationName,
        notes: requestNotes.trim() || undefined,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to submit integration request');
      }

      toast({
        title: 'Integration Request Submitted',
        description: `${integrationName} has been requested for your workspace. The platform team will review and follow up within 24-48 business hours.`,
      });

      setRequestDialogOpen(false);
      setRequestedIntegrationName('');
      setRequestNotes('');
    } catch (err: unknown) {
      toast({
        title: 'Request Failed',
        description: err?.message || 'Could not submit your integration request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const getStatusBadge = (status: AccountingIntegration['status']) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200"><Check className="w-3 h-3 mr-1" />Connected</Badge>;
      case 'available':
        return <Badge variant="outline">Available</Badge>;
      case 'coming_soon':
        return null;
    }
  };

  const pageConfig: CanvasPageConfig = {
    id: 'accounting-integrations',
    title: 'Accounting Integrations',
    subtitle: 'Connect CoAIleague with your accounting software for streamlined payroll and financial management',
    category: 'settings',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Card className="mb-6 sm:mb-8 border-primary/20 bg-primary/5">
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 rounded-lg bg-primary/10 flex-shrink-0">
              <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold mb-1 text-sm sm:text-base">Streamline Your Payroll Operations</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Connecting your accounting software reduces manual data entry, minimizes errors, and keeps financial records in sync.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {INTEGRATIONS.map((integration) => {
          const IconComponent = integration.icon;
          return (
            <Card key={integration.id} className="hover-elevate" data-testid={`integration-card-${integration.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className={`p-2 sm:p-3 rounded-lg bg-secondary flex-shrink-0 ${integration.iconColor}`}>
                      <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">{integration.name}</CardTitle>
                      {getStatusBadge(integration.status) && (
                        <div className="mt-1">{getStatusBadge(integration.status)}</div>
                      )}
                    </div>
                  </div>
                  {integration.website && (
                    <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
                      <a href={integration.website} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4 text-xs sm:text-sm">{integration.description}</CardDescription>
                {integration.status === 'coming_soon' && (
                  <p className="mb-4 text-xs sm:text-sm text-muted-foreground">
                    Available in a future update. Request access to help us prioritize this integration for your workspace.
                  </p>
                )}
                <div className="space-y-2">
                  {integration.features.slice(0, 4).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs sm:text-sm">
                      <Check className="w-4 h-4 text-green-500 dark:text-green-400 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                {integration.status === 'available' ? (
                  <Button 
                    className="w-full" 
                    onClick={() => handleConnect(integration)}
                    data-testid={`connect-${integration.id}`}
                  >
                    <Link2 className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Connect {integration.name}</span>
                  </Button>
                ) : integration.status === 'connected' ? (
                  <Button variant="outline" className="w-full">
                    <Settings className="w-4 h-4 mr-2" />
                    Manage Connection
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" onClick={() => openRequestDialog(integration.name)}>
                    Request Early Access
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Need a Different Integration?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            We're continuously adding support for more accounting platforms. Let us know which integration would be most valuable for your business.
          </p>
          <Button variant="outline" data-testid="button-request-integration" onClick={() => openRequestDialog()}>
            Request Integration
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      <UniversalModal open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Connect {selectedIntegration?.name}</UniversalModalTitle>
            <UniversalModalDescription>
              Enter your API credentials to connect {selectedIntegration?.name} with CoAIleague
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key / Client ID</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                data-testid="input-api-key"
              />
              <p className="text-xs text-muted-foreground">
                You can find this in your {selectedIntegration?.name} developer settings
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setConnectDialogOpen(false)} 
                className="flex-1"
                data-testid="button-cancel-connect"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitConnection}
                disabled={isConnecting || !apiKey.trim()}
                className="flex-1"
                data-testid="button-submit-connect"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    Connect
                  </>
                )}
              </Button>
            </div>
          </div>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Request an Integration</UniversalModalTitle>
            <UniversalModalDescription>
              Tell us which accounting platform you need and any details that will help us prioritize or validate the request.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="requestedIntegrationName">Integration Name</Label>
              <Input
                id="requestedIntegrationName"
                value={requestedIntegrationName}
                onChange={(e) => setRequestedIntegrationName(e.target.value)}
                placeholder="e.g. Sage Intacct, NetSuite, Zoho Books"
                data-testid="input-requested-integration-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requestNotes">Notes</Label>
              <Textarea
                id="requestNotes"
                value={requestNotes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setRequestNotes(e.target.value)}
                placeholder="Share the workflow you need, timeline, or any accounting requirements."
                data-testid="input-requested-integration-notes"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRequestDialogOpen(false)}
                className="flex-1"
                data-testid="button-cancel-integration-request"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitIntegrationRequest}
                disabled={isSubmittingRequest || !requestedIntegrationName.trim()}
                className="flex-1"
                data-testid="button-submit-integration-request"
              >
                {isSubmittingRequest ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Submit Request
                  </>
                )}
              </Button>
            </div>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
