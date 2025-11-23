import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost, apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/config/queryKeys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Shield, ShieldCheck, AlertTriangle, Key, Download, CheckCircle2 } from 'lucide-react';

const tokenSchema = z.object({
  token: z.string().min(6, 'Token must be at least 6 characters'),
});

const passwordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export default function Setup2FA() {
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; backupCodes: string[] } | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch MFA status
  const { data: mfaStatus = { enabled: false, backupCodesRemaining: 0 }, isLoading: statusLoading } = useQuery({
    queryKey: queryKeys.auth.mfa,
    queryFn: () => apiGet('auth.mfaStatus'),
  });

  // Setup MFA mutation
  const setupMutation = useMutation({
    mutationFn: () => apiPost('auth.setupMfa', {}),
    onSuccess: (data: { qrCodeUrl: string; backupCodes: string[] }) => {
      setSetupData(data);
      setIsSetupMode(true);
    },
    onError: () => {
      toast({
        title: 'Setup Failed',
        description: 'Failed to setup MFA. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Enable MFA mutation
  const enableForm = useForm({
    resolver: zodResolver(tokenSchema),
    defaultValues: { token: '' },
  });

  const enableMutation = useMutation({
    mutationFn: (values: z.infer<typeof tokenSchema>) => apiPost('auth.enableMfa', values),
    onSuccess: () => {
      toast({
        title: 'MFA Enabled',
        description: 'Two-factor authentication has been successfully enabled.',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.mfa });
      setIsSetupMode(false);
      setSetupData(null);
      enableForm.reset();
    },
    onError: () => {
      toast({
        title: 'Verification Failed',
        description: 'Invalid token. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Disable MFA mutation
  const disableForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  });

  const disableMutation = useMutation({
    mutationFn: (values: z.infer<typeof passwordSchema>) => apiPost('auth.disableMfa', values),
    onSuccess: () => {
      toast({
        title: 'MFA Disabled',
        description: 'Two-factor authentication has been disabled.',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.mfa });
      disableForm.reset();
    },
    onError: () => {
      toast({
        title: 'Failed to Disable',
        description: 'Invalid password or operation failed.',
        variant: 'destructive',
      });
    },
  });

  // Regenerate backup codes
  const regenerateMutation = useMutation({
    mutationFn: () => apiPost('auth.regenerateBackupCodes', {}),
    onSuccess: (data: { qrCodeUrl: string; backupCodes: string[] }) => {
      setSetupData(data);
      toast({
        title: 'Backup Codes Regenerated',
        description: 'New backup codes have been generated. Please save them securely.',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.mfa });
    },
    onError: () => {
      toast({
        title: 'Failed',
        description: 'Failed to regenerate backup codes.',
        variant: 'destructive',
      });
    },
  });

  const downloadBackupCodes = () => {
    if (!setupData?.backupCodes) return;
    
    const content = `AutoForce™ MFA Backup Codes\n\nGenerated: ${new Date().toLocaleString()}\n\n${setupData.backupCodes.join('\n')}\n\nKeep these codes in a safe place. Each code can only be used once.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoforce-mfa-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Two-Factor Authentication</h1>
          <p className="text-muted-foreground">Add an extra layer of security to your account</p>
        </div>
      </div>

      {mfaStatus?.enabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              MFA Enabled
            </CardTitle>
            <CardDescription>
              Your account is protected with two-factor authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                You have <strong>{mfaStatus.backupCodesRemaining || 0}</strong> backup codes remaining.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                data-testid="button-regenerate-codes"
              >
                <Key className="mr-2 h-4 w-4" />
                Regenerate Backup Codes
              </Button>

              <Form {...disableForm}>
                <form
                  onSubmit={disableForm.handleSubmit((values) => disableMutation.mutate(values))}
                  className="flex gap-3 items-end flex-1"
                >
                  <FormField
                    control={disableForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Enter password to disable MFA</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Your password"
                            data-testid="input-disable-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={disableMutation.isPending}
                    data-testid="button-disable-mfa"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Disable MFA
                  </Button>
                </form>
              </Form>
            </div>

            {setupData?.backupCodes && (
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-lg">New Backup Codes</CardTitle>
                  <CardDescription>
                    Save these codes in a secure location. Each can be used once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {setupData.backupCodes.map((code, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="font-mono text-sm justify-center py-2"
                        data-testid={`backup-code-${index}`}
                      >
                        {code}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    onClick={downloadBackupCodes}
                    variant="outline"
                    className="w-full"
                    data-testid="button-download-codes"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Backup Codes
                  </Button>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      ) : isSetupMode && setupData ? (
        <Card>
          <CardHeader>
            <CardTitle>Setup Two-Factor Authentication</CardTitle>
            <CardDescription>
              Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <img
                src={setupData.qrCodeUrl}
                alt="MFA QR Code"
                className="border rounded-lg p-4 bg-white"
                data-testid="img-qr-code"
              />
            </div>

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Backup Codes</CardTitle>
                <CardDescription>
                  Save these codes securely. You can use them if you lose access to your authenticator app.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {setupData.backupCodes.map((code, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="font-mono text-sm justify-center py-2"
                      data-testid={`backup-code-${index}`}
                    >
                      {code}
                    </Badge>
                  ))}
                </div>
                <Button
                  onClick={downloadBackupCodes}
                  variant="outline"
                  className="w-full"
                  data-testid="button-download-codes"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Backup Codes
                </Button>
              </CardContent>
            </Card>

            <Form {...enableForm}>
              <form
                onSubmit={enableForm.handleSubmit((values) => enableMutation.mutate(values))}
                className="space-y-4"
              >
                <FormField
                  control={enableForm.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter 6-digit code from your app"
                          data-testid="input-verification-code"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsSetupMode(false);
                      setSetupData(null);
                      enableForm.reset();
                    }}
                    data-testid="button-cancel-setup"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={enableMutation.isPending}
                    data-testid="button-enable-mfa"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Enable MFA
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Enable Two-Factor Authentication</CardTitle>
            <CardDescription>
              Protect your account with an additional layer of security
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication (2FA) adds an extra layer of security by requiring a code from your phone
                in addition to your password when signing in.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              size="lg"
              data-testid="button-start-setup"
            >
              <Shield className="mr-2 h-5 w-5" />
              Start Setup
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
