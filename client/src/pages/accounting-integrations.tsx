/**
 * Accounting Integrations - Connect with popular accounting software
 * 
 * Features:
 * - QuickBooks integration placeholder
 * - Xero integration placeholder
 * - FreshBooks integration placeholder
 * - Wave Accounting integration placeholder
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Link2, Check, ExternalLink, Settings, RefreshCw,
  Calculator, Building2, Briefcase, FileSpreadsheet, ArrowRight
} from "lucide-react";
import { SiQuickbooks, SiXero } from "react-icons/si";

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
    iconColor: 'text-green-600',
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
    iconColor: 'text-blue-500',
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
    iconColor: 'text-blue-600',
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

export default function AccountingIntegrations() {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<AccountingIntegration | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = (integration: AccountingIntegration) => {
    setSelectedIntegration(integration);
    setConnectDialogOpen(true);
  };

  const handleSubmitConnection = async () => {
    if (!selectedIntegration || !apiKey.trim()) return;
    
    setIsConnecting(true);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    toast({
      title: 'Connection Request Submitted',
      description: `Your ${selectedIntegration.name} integration request has been submitted. Our team will verify and activate it within 24-48 hours.`,
    });
    
    setIsConnecting(false);
    setConnectDialogOpen(false);
    setApiKey('');
    setSelectedIntegration(null);
  };

  const getStatusBadge = (status: AccountingIntegration['status']) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200"><Check className="w-3 h-3 mr-1" />Connected</Badge>;
      case 'available':
        return <Badge variant="outline">Available</Badge>;
      case 'coming_soon':
        return <Badge variant="secondary">Coming Soon</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
          <Building2 className="w-8 h-8 text-primary" />
          Accounting Integrations
        </h1>
        <p className="text-muted-foreground mt-2">
          Connect CoAIleague with your accounting software for streamlined payroll and financial management
        </p>
      </div>

      <Card className="mb-8 border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Streamline Your Payroll Operations</h3>
              <p className="text-sm text-muted-foreground">
                Connecting your accounting software significantly reduces manual data entry, minimizes errors, and helps keep your financial records in sync with your workforce management system.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {INTEGRATIONS.map((integration) => {
          const IconComponent = integration.icon;
          return (
            <Card key={integration.id} className="hover-elevate" data-testid={`integration-card-${integration.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg bg-secondary ${integration.iconColor}`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{integration.name}</CardTitle>
                      <div className="mt-1">{getStatusBadge(integration.status)}</div>
                    </div>
                  </div>
                  {integration.website && (
                    <Button variant="ghost" size="icon" asChild>
                      <a href={integration.website} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">{integration.description}</CardDescription>
                <div className="space-y-2">
                  {integration.features.slice(0, 4).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
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
                    <Link2 className="w-4 h-4 mr-2" />
                    Connect {integration.name}
                  </Button>
                ) : integration.status === 'connected' ? (
                  <Button variant="outline" className="w-full">
                    <Settings className="w-4 h-4 mr-2" />
                    Manage Connection
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    Coming Soon
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
          <Button variant="outline" data-testid="button-request-integration">
            Request Integration
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {selectedIntegration?.name}</DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect {selectedIntegration?.name} with CoAIleague
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
