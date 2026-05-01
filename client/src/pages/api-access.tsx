import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  Eye,
  Key,
  Plus,
  Copy,
  Trash2,
  EyeOff,
  Activity,
  Code,
  Shield,
  AlertTriangle,
  Clock,
  ArrowLeft,
} from 'lucide-react';;

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  rateLimit: number;
  rateLimitWindow: string;
  totalRequests: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  rawKey?: string;
}

interface UsageLog {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  createdAt: string;
}

export default function ApiAccess() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newRateLimit, setNewRateLimit] = useState("1000");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [permRead, setPermRead] = useState(true);
  const [permWrite, setPermWrite] = useState(false);
  const [permAdmin, setPermAdmin] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ['/api/enterprise-features/api-keys'],
  });

  const { data: usageLogs } = useQuery<UsageLog[]>({
    queryKey: ['/api/enterprise-features/api-keys', selectedKeyId, 'usage'],
    enabled: !!selectedKeyId,
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest('POST', '/api/enterprise-features/api-keys', data);
      return res;
    },
    onSuccess: async (response) => {
      const data = typeof response.json === 'function' ? await response.json() : response;
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise-features/api-keys'] });
      if (data.rawKey) {
        setNewlyCreatedKey(data.rawKey);
      }
      toast({ title: "API Key Created", description: "Your new API key has been generated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to create API key", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      return await apiRequest('DELETE', `/api/enterprise-features/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise-features/api-keys'] });
      toast({ title: "Key Revoked", description: "API key has been deactivated." });
      if (selectedKeyId) setSelectedKeyId(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to revoke key", variant: "destructive" });
    },
  });

  const handleCreateKey = () => {
    const permissions: string[] = [];
    if (permRead) permissions.push("read");
    if (permWrite) permissions.push("write");
    if (permAdmin) permissions.push("admin");
    createKeyMutation.mutate({
      name: newKeyName || "API Key",
      permissions,
      rateLimit: parseInt(newRateLimit) || 1000,
      expiresAt: newExpiresAt || undefined,
    });
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setNewlyCreatedKey(null);
    setNewKeyName("");
    setNewRateLimit("1000");
    setNewExpiresAt("");
    setPermRead(true);
    setPermWrite(false);
    setPermAdmin(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: "Copied to clipboard." });
    }).catch((err) => {
      console.error('Clipboard copy failed:', err);
      toast({
        title: "Copy failed",
        description: "Please copy manually.",
        variant: "destructive"
      });
    });
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const selectedKey = apiKeys?.find((k) => k.id === selectedKeyId);

  const pageConfig: CanvasPageConfig = {
    id: 'api-access',
    title: 'API Access Management',
    subtitle: 'Manage API keys for programmatic access to your workspace',
    category: 'admin' as any,
    showHeader: true,
  };

  if (selectedKeyId && selectedKey) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="space-y-6">
          <Button variant="outline" onClick={() => setSelectedKeyId(null)} data-testid="button-back-to-keys">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to API Keys
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    {selectedKey.name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{selectedKey.keyPrefix}...</code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedKey.keyPrefix)}
                      data-testid="button-copy-prefix-detail"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Prefix
                    </Button>
                  </CardDescription>
                </div>
                <Badge variant={selectedKey.isActive ? "default" : "destructive"}>
                  {selectedKey.isActive ? "Active" : "Revoked"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">Rate Limit</p>
                  <p className="text-sm font-medium" data-testid="text-detail-rate-limit">
                    {selectedKey.rateLimit} requests/{selectedKey.rateLimitWindow || "hour"}
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">Total Requests</p>
                  <p className="text-sm font-medium" data-testid="text-detail-total-requests">
                    {selectedKey.totalRequests?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">Last Used</p>
                  <p className="text-sm font-medium">{formatDate(selectedKey.lastUsedAt)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">Permissions</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {selectedKey.permissions?.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5" />
                Usage Logs
              </CardTitle>
              <CardDescription>Recent API requests made with this key</CardDescription>
            </CardHeader>
            <CardContent>
              {usageLogs && usageLogs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Endpoint</th>
                        <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Method</th>
                        <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Status</th>
                        <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Response Time</th>
                        <th className="py-2 text-xs font-medium text-muted-foreground">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageLogs.map((log) => (
                        <tr key={log.id} className="border-b" data-testid={`usage-row-${log.id}`}>
                          <td className="py-2 pr-4">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.endpoint}</code>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs">{log.method}</Badge>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge
                              variant={log.statusCode < 400 ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {log.statusCode}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{log.responseTime}ms</td>
                          <td className="py-2 text-muted-foreground text-xs">{formatDate(log.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No usage logs yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code className="h-5 w-5" />
              Quick Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Base URL</p>
                <code className="text-sm font-medium" data-testid="text-api-base-url">
                  {window.location.origin}/api/v1
                </code>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Authentication</p>
                <code className="text-sm font-medium" data-testid="text-auth-method">
                  Bearer Token
                </code>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Header Format</p>
                <code className="text-sm font-medium">
                  Authorization: Bearer coa_...
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Keys
                </CardTitle>
                <CardDescription>Manage programmatic access keys for your workspace</CardDescription>
              </div>
              <UniversalModal open={dialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setDialogOpen(true); }}>
                <UniversalModalTrigger asChild>
                  <Button data-testid="button-generate-key">
                    <Plus className="h-4 w-4 mr-2" />
                    Generate New Key
                  </Button>
                </UniversalModalTrigger>
                <UniversalModalContent>
                  {newlyCreatedKey ? (
                    <>
                      <UniversalModalHeader>
                        <UniversalModalTitle>API Key Created</UniversalModalTitle>
                        <UniversalModalDescription>Copy your key now. It will not be shown again.</UniversalModalDescription>
                      </UniversalModalHeader>
                      <div className="space-y-4 py-4">
                        <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive">This key will only be shown once. Store it securely.</p>
                        </div>
                        <div className="relative">
                          <code
                            className="block w-full p-3 bg-muted rounded-md text-xs break-all font-mono"
                            data-testid="text-raw-api-key"
                          >
                            {newlyCreatedKey}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => copyToClipboard(newlyCreatedKey)}
                            data-testid="button-copy-raw-key"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <UniversalModalFooter>
                        <Button onClick={handleCloseDialog} data-testid="button-done-key">Done</Button>
                      </UniversalModalFooter>
                    </>
                  ) : (
                    <>
                      <UniversalModalHeader>
                        <UniversalModalTitle>Generate New API Key</UniversalModalTitle>
                        <UniversalModalDescription>Create an API key for programmatic access</UniversalModalDescription>
                      </UniversalModalHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="key-name">Key Name</Label>
                          <Input
                            id="key-name"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="e.g. Production Integration"
                            data-testid="input-key-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Permissions</Label>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="perm-read"
                                checked={permRead}
                                onCheckedChange={(c) => setPermRead(c === true)}
                                data-testid="checkbox-perm-read"
                              />
                              <Label htmlFor="perm-read" className="text-sm font-normal">Read</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="perm-write"
                                checked={permWrite}
                                onCheckedChange={(c) => setPermWrite(c === true)}
                                data-testid="checkbox-perm-write"
                              />
                              <Label htmlFor="perm-write" className="text-sm font-normal">Write</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="perm-admin"
                                checked={permAdmin}
                                onCheckedChange={(c) => setPermAdmin(c === true)}
                                data-testid="checkbox-perm-admin"
                              />
                              <Label htmlFor="perm-admin" className="text-sm font-normal">Admin</Label>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rate-limit">Rate Limit (requests/hour)</Label>
                          <Input
                            id="rate-limit"
                            type="number"
                            value={newRateLimit}
                            onChange={(e) => setNewRateLimit(e.target.value)}
                            data-testid="input-rate-limit"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expires-at">Expiration Date (optional)</Label>
                          <Input
                            id="expires-at"
                            type="date"
                            value={newExpiresAt}
                            onChange={(e) => setNewExpiresAt(e.target.value)}
                            data-testid="input-expires-at"
                          />
                        </div>
                      </div>
                      <UniversalModalFooter>
                        <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel-key">Cancel</Button>
                        <Button
                          onClick={handleCreateKey}
                          disabled={createKeyMutation.isPending}
                          data-testid="button-create-key"
                        >
                          {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                        </Button>
                      </UniversalModalFooter>
                    </>
                  )}
                </UniversalModalContent>
              </UniversalModal>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading API keys...</div>
            ) : apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-lg border flex-wrap"
                    data-testid={`api-key-row-${key.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium" data-testid={`text-key-name-${key.id}`}>{key.name}</p>
                          <Badge variant={key.isActive ? "default" : "destructive"} className="text-xs">
                            {key.isActive ? "Active" : "Revoked"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <code className="bg-muted px-1 py-0.5 rounded" data-testid={`text-key-prefix-${key.id}`}>
                            {key.keyPrefix}...
                          </code>
                          <span>{key.rateLimit} req/{key.rateLimitWindow || "hour"}</span>
                          <span>{key.totalRequests?.toLocaleString() || 0} total requests</span>
                          <span>Last used: {formatDate(key.lastUsedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {key.permissions?.map((p) => (
                            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(key.keyPrefix)}
                        data-testid={`button-copy-prefix-${key.id}`}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Prefix
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedKeyId(key.id)}
                        data-testid={`button-view-usage-${key.id}`}
                      >
                        <Activity className="h-3 w-3 mr-1" />
                        Usage
                      </Button>
                      {key.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeKeyMutation.mutate(key.id)}
                          disabled={revokeKeyMutation.isPending}
                          data-testid={`button-revoke-key-${key.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">No API keys configured</p>
                <p className="text-xs mt-1 mb-4">Generate a key to start using the API programmatically</p>
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  data-testid="button-empty-generate-key"
                >
                  <Key className="h-4 w-4 mr-2" />
                  Generate API Key
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
