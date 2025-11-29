import { useAuth } from "@/hooks/useAuth";
import { useModules } from "@/config/moduleConfig";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Settings, BarChart3, Shield } from "lucide-react";
import { HelpAIIntegrationPanel } from "@/components/helpai";

export default function HelpAIOrchestration() {
  const { user } = useAuth();
  const modules = useModules();
  const module = modules.getModule('communications');

  if (!module?.enabled) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Module Not Available</CardTitle>
            <CardDescription>HelpAI Orchestration is not enabled for your subscription tier</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" data-testid="helpai-orchestration-page">
      {/* Page Header */}
      <div className="border-b p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6" />
          <h1 className="text-2xl font-bold">HelpAI Orchestration</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect and manage business system integrations for intelligent orchestration
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue="integrations" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="integrations" className="flex gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
            <TabsTrigger value="registry" className="flex gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Registry</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
          </TabsList>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Business System Integrations</CardTitle>
                <CardDescription>
                  Configure connections to your HR, payroll, scheduling, and other business systems
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HelpAIIntegrationPanel />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Registry Tab */}
          <TabsContent value="registry" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Registry</CardTitle>
                <CardDescription>
                  View all available business system APIs in the registry
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HelpAIIntegrationPanel />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Configuration</CardTitle>
                <CardDescription>
                  Manage encryption settings and credential security
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Encryption Settings</h4>
                  <p className="text-sm text-muted-foreground">
                    All credentials are encrypted using AES-256-GCM encryption at rest
                  </p>
                  <div className="mt-2 p-3 rounded-md bg-muted/50 border">
                    <div className="text-xs space-y-1">
                      <div><strong>Algorithm:</strong> AES-256-GCM</div>
                      <div><strong>Key Derivation:</strong> PBKDF2-SHA256</div>
                      <div><strong>Hash Algorithm:</strong> SHA-256</div>
                      <div><strong>Integrity Verification:</strong> Enabled</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Credential Management</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Credentials are securely stored with encryption</li>
                    <li>• Expiry warnings at 7 days before credential expiration</li>
                    <li>• Maximum 3 credentials per integration</li>
                    <li>• Audit trail logs all credential access events</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Tab */}
          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>
                  Monitor all integration activities and security events
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HelpAIIntegrationPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
