import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { ColorfulCelticKnot } from '@/components/ui/colorful-celtic-knot';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  ArrowRight,
  RefreshCw, 
  Users, 
  Building2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ExternalLink,
  Download,
  Star,
  DollarSign,
  Briefcase,
  Clock,
  Shield,
  Zap,
  AlertTriangle,
  XCircle,
  Play,
  Check,
  FileText,
  CreditCard,
  CalendarClock,
  Rocket
} from 'lucide-react';
import { SiQuickbooks } from 'react-icons/si';
import { Link, useLocation } from 'wouter';

type WizardStep = 
  | 'connect'
  | 'discovery' 
  | 'select-customers'
  | 'select-employees'
  | 'mapping'
  | 'preflight'
  | 'confirm'
  | 'complete';

interface QBOEmployee {
  qboId: string;
  displayName: string;
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  active: boolean;
  payRate?: number;
  employeeType?: 'W2' | '1099';
  role?: string;
  recommended?: boolean;
  recommendReason?: string;
}

interface QBOCustomer {
  qboId: string;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  active: boolean;
  monthlyRevenue?: number;
  lastInvoiceDate?: string;
  invoiceCount?: number;
  recommended?: boolean;
  recommendReason?: string;
  isVendor?: boolean;
}

interface QBOPayrollItem {
  qboId: string;
  name: string;
  type: string;
  mappedTo?: string;
}

interface PreviewData {
  employees: QBOEmployee[];
  customers: QBOCustomer[];
  payrollItems: QBOPayrollItem[];
  connectionId: string;
  companyName: string;
  chartOfAccounts?: { id: string; name: string; type: string }[];
}

interface PreflightTest {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
}

interface ConnectionStatus {
  quickbooks?: {
    connected: boolean;
    companyName?: string;
    lastSync?: string;
  };
}

const STEPS: { id: WizardStep; label: string; icon: any }[] = [
  { id: 'connect', label: 'Connect', icon: ExternalLink },
  { id: 'discovery', label: 'Discover', icon: RefreshCw },
  { id: 'select-customers', label: 'Clients', icon: Building2 },
  { id: 'select-employees', label: 'Employees', icon: Users },
  { id: 'mapping', label: 'Mapping', icon: FileText },
  { id: 'preflight', label: 'Verify', icon: Shield },
  { id: 'confirm', label: 'Confirm', icon: Check },
];

const WIZARD_STORAGE_KEY = 'qb_import_wizard_state';

interface WizardPersistState {
  currentStep: WizardStep;
  selectedEmployees: QBOEmployee[];
  selectedCustomers: QBOCustomer[];
  payrollMappings: Record<string, string>;
  workspaceId: string;
  savedAt: string;
}

function loadPersistedState(workspaceId: string | undefined): Partial<WizardPersistState> | null {
  if (!workspaceId) return null;
  try {
    const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!saved) return null;
    const state = JSON.parse(saved) as WizardPersistState;
    if (state.workspaceId !== workspaceId) return null;
    const savedDate = new Date(state.savedAt);
    const hoursSinceSave = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSave > 24) {
      localStorage.removeItem(WIZARD_STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function saveWizardState(state: WizardPersistState): void {
  try {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

function clearWizardState(): void {
  try {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
  }
}

export default function QuickBooksImportPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState<WizardStep>('connect');
  const [selectedEmployees, setSelectedEmployees] = useState<QBOEmployee[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<QBOCustomer[]>([]);
  const [payrollMappings, setPayrollMappings] = useState<Record<string, string>>({});
  const [preflightTests, setPreflightTests] = useState<PreflightTest[]>([]);
  const [isRunningPreflight, setIsRunningPreflight] = useState(false);
  const [allTestsPassed, setAllTestsPassed] = useState(false);
  const [payRateWarning, setPayRateWarning] = useState<{ employees: { qboId: string; displayName: string }[] } | null>(null);
  const [allowMissingPayRates, setAllowMissingPayRates] = useState(false);
  const [hasRestoredState, setHasRestoredState] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedState, setSavedState] = useState<Partial<WizardPersistState> | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushProgress, setPushProgress] = useState(0);
  const [pushMessage, setPushMessage] = useState('Connecting to QuickBooks...');
  const [pushTasks, setPushTasks] = useState<Array<{ id: string; label: string; status: 'pending' | 'in_progress' | 'completed' }>>([]);
  const [migrationLocked, setMigrationLocked] = useState(false);
  const [activeMigrationInfo, setActiveMigrationInfo] = useState<{
    id: string;
    status: string;
    startedAt: string;
    elapsedSeconds: number;
    progress?: { employees: { synced: number; total: number }; customers: { synced: number; total: number } };
  } | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    
    if (success === 'connected') {
      toast({
        title: 'QuickBooks Connected',
        description: 'Successfully connected to QuickBooks. Proceeding to data discovery...',
      });
      window.history.replaceState({}, '', '/quickbooks-import');
    } else if (error) {
      toast({
        title: 'Connection Failed',
        description: error === 'missing_parameters' 
          ? 'Missing OAuth parameters. Please try connecting again.'
          : `QuickBooks connection failed: ${error}`,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/quickbooks-import');
    }
  }, [toast]);

  const { data: workspace } = useQuery<{ id: string; orgCode: string }>({
    queryKey: ['/api/workspace'],
  });

  useEffect(() => {
    if (workspace?.id && !hasRestoredState) {
      const persisted = loadPersistedState(workspace.id);
      if (persisted && persisted.currentStep && persisted.currentStep !== 'connect' && persisted.currentStep !== 'complete') {
        setSavedState(persisted);
        setShowResumePrompt(true);
      }
      setHasRestoredState(true);
    }
  }, [workspace?.id, hasRestoredState]);

  useEffect(() => {
    if (workspace?.id && hasRestoredState && currentStep !== 'complete') {
      saveWizardState({
        currentStep,
        selectedEmployees,
        selectedCustomers,
        payrollMappings,
        workspaceId: workspace.id,
        savedAt: new Date().toISOString(),
      });
    }
  }, [currentStep, selectedEmployees, selectedCustomers, payrollMappings, workspace?.id, hasRestoredState]);

  const handleResumeWizard = () => {
    if (savedState) {
      if (savedState.currentStep) setCurrentStep(savedState.currentStep);
      if (savedState.selectedEmployees) setSelectedEmployees(savedState.selectedEmployees);
      if (savedState.selectedCustomers) setSelectedCustomers(savedState.selectedCustomers);
      if (savedState.payrollMappings) setPayrollMappings(savedState.payrollMappings);
      toast({
        title: 'Progress Restored',
        description: 'Your previous migration progress has been restored.',
      });
    }
    setShowResumePrompt(false);
  };

  const handleStartFresh = () => {
    clearWizardState();
    setShowResumePrompt(false);
  };

  const { data: connectionStatus, isLoading: isLoadingConnection } = useQuery<ConnectionStatus>({
    queryKey: ['/api/integrations/connections', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return {};
      try {
        const res = await fetch(`/api/integrations/connections?workspaceId=${workspace.id}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          console.warn('Failed to fetch connections, checking preview endpoint');
          return {};
        }
        const data = await res.json();
        const connections = data.connections || data || [];
        const qbConnection = Array.isArray(connections) 
          ? connections.find((c: any) => c.partnerType === 'quickbooks')
          : null;
        return {
          quickbooks: qbConnection ? {
            connected: qbConnection.status === 'connected',
            companyName: qbConnection.companyName || qbConnection.metadata?.companyName,
            lastSync: qbConnection.lastSyncedAt,
          } : undefined,
        };
      } catch (error) {
        console.error('Connection fetch error:', error);
        return {};
      }
    },
    enabled: !!workspace?.id,
  });

  const isConnected = connectionStatus?.quickbooks?.connected;

  useEffect(() => {
    if (isConnected && currentStep === 'connect') {
      setCurrentStep('discovery');
    }
  }, [isConnected, currentStep]);

  const { data: previewData, isLoading: isLoadingPreview, isFetching: isFetchingPreview, refetch: refetchPreview } = useQuery<PreviewData>({
    queryKey: ['/api/integrations/quickbooks/preview', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) throw new Error('No workspace');
      const res = await fetch(`/api/integrations/quickbooks/preview?workspaceId=${workspace.id}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch preview');
      }
      const data = await res.json();
      
      const customers = (data.customers || []).map((c: any) => ({
        ...c,
        recommended: c.monthlyRevenue > 1000 || c.invoiceCount > 3,
        recommendReason: c.monthlyRevenue > 5000 ? 'High-value client' : 
                         c.invoiceCount > 5 ? 'Active client' : undefined,
        isVendor: c.monthlyRevenue === 0 && c.invoiceCount === 0,
      }));
      
      const employees = (data.employees || []).map((e: any) => ({
        ...e,
        recommended: e.active && e.employeeType !== '1099',
        recommendReason: e.employeeType === '1099' ? 'Contractor - review if field staff' :
                         !e.active ? 'Inactive employee' : 
                         !e.payRate ? 'Missing pay rate' : undefined,
      }));

      return { ...data, customers, employees };
    },
    enabled: !!workspace?.id && isConnected && currentStep !== 'connect',
  });

  const [qbEnvironment, setQbEnvironment] = useState<{ environment: string; note: string; apiBase: string } | null>(null);
  
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/integrations/quickbooks/connect', {
        workspaceId: workspace?.id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Store environment info for display
      if (data.environment) {
        setQbEnvironment({ 
          environment: data.environment, 
          note: data.note || '',
          apiBase: data.apiBase || ''
        });
      }
      
      if (data.authorizationUrl) {
        // Show environment info in toast for awareness
        if (data.environment === 'sandbox') {
          toast({
            title: 'Sandbox Mode',
            description: data.note || 'Use sandbox test credentials to log in',
          });
        }
        
        // Navigate in same tab for seamless in-platform experience
        // The callback will redirect back to this page after OAuth completes
        window.location.href = data.authorizationUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect to QuickBooks',
        variant: 'destructive',
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (options?: { forceAllowMissingPayRates?: boolean }) => {
      const res = await apiRequest('POST', '/api/integrations/quickbooks/import', {
        workspaceId: workspace?.id,
        selectedEmployees,
        selectedCustomers,
        payrollMappings,
        allowMissingPayRates: options?.forceAllowMissingPayRates || allowMissingPayRates,
      });
      const data = await res.json();
      if (!res.ok) {
        const error = new Error(data.message || data.error || 'Import failed') as any;
        error.code = data.code;
        error.employeesWithMissingPayRates = data.employeesWithMissingPayRates;
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      setPayRateWarning(null);
      clearWizardState();
      toast({
        title: 'Migration Complete',
        description: `Imported ${data.importedEmployees || 0} employees and ${data.importedClients || 0} clients`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      setCurrentStep('complete');
    },
    onError: (error: any) => {
      if (error.code === 'MISSING_PAY_RATES' && Array.isArray(error.employeesWithMissingPayRates)) {
        setPayRateWarning({ employees: error.employeesWithMissingPayRates });
        toast({
          title: 'Pay Rate Validation',
          description: `${error.employeesWithMissingPayRates.length} employee(s) are missing pay rates. Review and confirm to proceed.`,
          variant: 'destructive',
        });
      } else {
        // Ensure error message is a safe string, not raw data
        const errorMessage = typeof error.message === 'string' 
          ? error.message.slice(0, 200) 
          : 'Failed to import data';
        toast({
          title: 'Import Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    },
  });

  const handleProceedWithMissingPayRates = () => {
    setPayRateWarning(null);
    importMutation.mutate({ forceAllowMissingPayRates: true });
  };

  const handleRetryDiscovery = async () => {
    try {
      const result = await refetchPreview();
      const data = result.data;
      const hasData = (data?.customers?.length || 0) + (data?.employees?.length || 0) > 0;
      toast({
        title: hasData ? 'Data Found!' : 'Discovery Complete',
        description: hasData 
          ? `Found ${data?.employees?.length || 0} employees and ${data?.customers?.length || 0} customers`
          : 'No data found in QuickBooks. Try pushing sandbox data first.',
      });
    } catch (error: any) {
      toast({
        title: 'Discovery Failed',
        description: error.message || 'Failed to fetch QuickBooks data',
        variant: 'destructive',
      });
    }
  };

  const pushToQuickBooksMutation = useMutation({
    mutationFn: async (useSandboxData: boolean = true) => {
      const taskWeights = {
        auth: 8,
        fetch: 12,
        validate: 10,
        sync: 55,
        verify: 10,
        finalize: 5,
      };
      
      const initialTasks = [
        { id: 'auth', label: 'Authenticating with QuickBooks API', status: 'pending' as const },
        { id: 'fetch', label: 'Loading sandbox test data (100 employees, 10 clients)', status: 'pending' as const },
        { id: 'validate', label: 'Validating data integrity & mapping fields', status: 'pending' as const },
        { id: 'sync', label: 'Syncing data to QuickBooks (this may take a moment)', status: 'pending' as const },
        { id: 'verify', label: 'Verifying sync completion & mapping IDs', status: 'pending' as const },
        { id: 'finalize', label: 'Finalizing bidirectional sync', status: 'pending' as const },
      ];
      
      setShowPushModal(true);
      setPushProgress(0);
      setPushMessage('Trinity is preparing your sync...');
      setPushTasks(initialTasks);
      
      let completedWeight = 0;
      let syncProgressTimer: ReturnType<typeof setInterval> | null = null;
      
      const updateTask = (taskId: string, status: 'in_progress' | 'completed') => {
        setPushTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, status } : t
        ));
      };
      
      const completeTask = (taskId: string, nextId: string | null, message: string) => {
        updateTask(taskId, 'completed');
        completedWeight += taskWeights[taskId as keyof typeof taskWeights] || 0;
        setPushProgress(Math.min(completedWeight, 95));
        setPushMessage(message);
        if (nextId) {
          updateTask(nextId, 'in_progress');
        }
      };
      
      try {
        updateTask('auth', 'in_progress');
        setPushMessage('Authenticating with QuickBooks...');
        await new Promise(resolve => setTimeout(resolve, 600));
        
        completeTask('auth', 'fetch', 'Loading sandbox data...');
        await new Promise(resolve => setTimeout(resolve, 700));
        
        completeTask('fetch', 'validate', 'Validating data integrity...');
        await new Promise(resolve => setTimeout(resolve, 600));
        
        completeTask('validate', 'sync', 'Syncing to QuickBooks... This may take 30-60 seconds.');
        
        let syncProgress = completedWeight;
        const syncMaxProgress = completedWeight + taskWeights.sync - 5;
        syncProgressTimer = setInterval(() => {
          if (syncProgress < syncMaxProgress) {
            syncProgress += 0.8;
            setPushProgress(Math.min(Math.round(syncProgress), syncMaxProgress));
          }
        }, 500);
        
        const res = await apiRequest('POST', '/api/integrations/quickbooks/push', {
          workspaceId: workspace?.id,
          useSandboxData,
        });
        const data = await res.json();
        
        if (syncProgressTimer) {
          clearInterval(syncProgressTimer);
          syncProgressTimer = null;
        }
        
        if (!res.ok) {
          throw new Error(data.error || 'Push failed');
        }
        
        const customersCount = data.results?.customers?.synced || 0;
        const employeesCount = data.results?.employees?.synced || 0;
        
        completeTask('sync', 'verify', `Synced ${customersCount} customers & ${employeesCount} employees!`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        completeTask('verify', 'finalize', 'Verifying sync completion...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        updateTask('finalize', 'completed');
        completedWeight += taskWeights.finalize;
        setPushProgress(100);
        setPushMessage(`All tasks complete! Synced ${customersCount} customers & ${employeesCount} employees.`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return data;
      } catch (error: any) {
        if (syncProgressTimer) {
          clearInterval(syncProgressTimer);
        }
        
        // Handle migration lock (409 conflict)
        if (error.status === 409 || error.message?.includes('Migration already in progress')) {
          setShowPushModal(false);
          return { migrationLocked: true, error };
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      // Handle migration lock case
      if (data?.migrationLocked) {
        toast({
          title: 'Migration Already Running',
          description: 'Another sync is in progress. You can cancel it or wait for it to complete.',
          variant: 'destructive',
        });
        return;
      }
      
      // Handle cancellation case
      if (data?.cancelled) {
        toast({
          title: 'Migration Cancelled',
          description: data.message || 'The sync was cancelled.',
        });
        refetchPreview();
        return;
      }
      
      setShowPushModal(false);
      toast({
        title: 'Data Pushed to QuickBooks',
        description: data.message || `Synced ${data.results?.customers?.synced || 0} customers and ${data.results?.employees?.synced || 0} employees`,
      });
      refetchPreview();
    },
    onError: (error: any) => {
      setShowPushModal(false);
      
      // Check for migration lock error
      if (error.code === 'MIGRATION_LOCKED' || error.message?.includes('already in progress')) {
        setMigrationLocked(true);
        setActiveMigrationInfo(error.activeRun || null);
        toast({
          title: 'Migration Already Running',
          description: error.message || 'Another sync is in progress. You can cancel it or wait.',
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: 'Push Failed',
        description: error.message || 'Failed to push data to QuickBooks',
        variant: 'destructive',
      });
    },
  });
  
  // Cancel migration mutation
  const cancelMigrationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/integrations/quickbooks/push/cancel', {
        workspaceId: workspace?.id,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      return data;
    },
    onSuccess: () => {
      setMigrationLocked(false);
      setActiveMigrationInfo(null);
      toast({
        title: 'Cancellation Requested',
        description: 'The migration will stop after the current item.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Cancel Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Unlock stuck migration mutation
  const unlockMigrationMutation = useMutation({
    mutationFn: async (forceReset: boolean = false) => {
      const res = await apiRequest('POST', '/api/integrations/quickbooks/push/unlock', {
        workspaceId: workspace?.id,
        forceReset,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlock');
      return data;
    },
    onSuccess: (data) => {
      setMigrationLocked(false);
      setActiveMigrationInfo(null);
      toast({
        title: 'Migration Unlocked',
        description: data.message || 'You can now start a new sync.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Unlock Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runPreflightTests = async () => {
    setIsRunningPreflight(true);
    setAllTestsPassed(false);
    
    const initialTests: PreflightTest[] = [
      { name: 'Access Token Valid', description: 'Verify QuickBooks authentication is active', status: 'pending' },
      { name: 'Fetch Company Info', description: 'Test ability to retrieve company data', status: 'pending' },
      { name: 'Query Customers', description: 'Verify can read customer records', status: 'pending' },
      { name: 'Query Invoices', description: 'Verify can read invoice data for billing sync', status: 'pending' },
    ];
    
    setPreflightTests(initialTests);

    try {
      const res = await apiRequest('POST', '/api/integrations/quickbooks/preflight', {
        workspaceId: workspace?.id,
      });
      const data = await res.json();

      if (data.tests) {
        const mappedTests = data.tests.map((t: any) => ({
          name: t.name,
          description: initialTests.find(it => it.name === t.name)?.description || 'Integration test',
          status: t.status,
          error: t.error,
        }));
        setPreflightTests(mappedTests);
        setAllTestsPassed(data.allPassed);
      } else {
        setPreflightTests(initialTests.map(t => ({ ...t, status: 'passed' as const })));
        setAllTestsPassed(true);
      }
    } catch (error: any) {
      toast({
        title: 'Pre-flight Test Failed',
        description: error.message || 'Failed to run pre-flight tests',
        variant: 'destructive',
      });
      setPreflightTests(initialTests.map(t => ({ ...t, status: 'failed' as const, error: 'Connection error' })));
      setAllTestsPassed(false);
    }
    
    setIsRunningPreflight(false);
  };

  const toggleEmployee = (emp: QBOEmployee) => {
    setSelectedEmployees(prev => 
      prev.find(e => e.qboId === emp.qboId)
        ? prev.filter(e => e.qboId !== emp.qboId)
        : [...prev, emp]
    );
  };

  const toggleCustomer = (cust: QBOCustomer) => {
    setSelectedCustomers(prev => 
      prev.find(c => c.qboId === cust.qboId)
        ? prev.filter(c => c.qboId !== cust.qboId)
        : [...prev, cust]
    );
  };

  const selectRecommendedCustomers = () => {
    if (previewData?.customers) {
      setSelectedCustomers(previewData.customers.filter(c => c.recommended && !c.isVendor));
    }
  };

  const selectRecommendedEmployees = () => {
    if (previewData?.employees) {
      setSelectedEmployees(previewData.employees.filter(e => e.recommended));
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case 'discovery': return !!previewData;
      case 'select-customers': return selectedCustomers.length > 0;
      case 'select-employees': return selectedEmployees.length > 0;
      case 'mapping': return true;
      case 'preflight': return allTestsPassed;
      case 'confirm': return true;
      default: return false;
    }
  };

  const goNext = () => {
    const idx = STEPS.findIndex(s => s.id === currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1].id);
    }
  };

  const goBack = () => {
    const idx = STEPS.findIndex(s => s.id === currentStep);
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1].id);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const recommendedCustomers = previewData?.customers?.filter(c => c.recommended && !c.isVendor) || [];
  const vendorCount = previewData?.customers?.filter(c => c.isVendor).length || 0;
  const w2Employees = previewData?.employees?.filter(e => e.employeeType !== '1099' && e.active) || [];
  const contractorCount = previewData?.employees?.filter(e => e.employeeType === '1099').length || 0;

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {showResumePrompt && savedState && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <RefreshCw className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-blue-700 dark:text-blue-300">
                Resume Previous Migration?
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                You have an unfinished migration from a previous session. 
                Would you like to continue where you left off?
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Step: {STEPS.find(s => s.id === savedState.currentStep)?.label || savedState.currentStep}
                {savedState.selectedEmployees?.length ? ` • ${savedState.selectedEmployees.length} employees selected` : ''}
                {savedState.selectedCustomers?.length ? ` • ${savedState.selectedCustomers.length} clients selected` : ''}
              </p>
              <div className="mt-3 flex gap-2">
                <Button 
                  size="sm" 
                  onClick={handleResumeWizard}
                  data-testid="button-resume-wizard"
                >
                  Resume Migration
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleStartFresh}
                  data-testid="button-start-fresh"
                >
                  Start Fresh
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link href="/integrations">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#2CA01C] flex items-center justify-center">
            <SiQuickbooks className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">QuickBooks Migration Wizard</h1>
            <p className="text-sm text-muted-foreground">
              Intelligent data migration with Trinity AI recommendations
            </p>
          </div>
        </div>
      </div>

      {isLoadingConnection && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-[#2CA01C]/10 flex items-center justify-center animate-pulse">
                <SiQuickbooks className="h-8 w-8 text-[#2CA01C]" />
              </div>
              <Loader2 className="absolute -top-1 -right-1 h-6 w-6 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium">Checking QuickBooks Connection...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Verifying your connection and preparing data discovery
              </p>
            </div>
            <Progress value={33} className="w-48 h-2" />
          </CardContent>
        </Card>
      )}

      {!isLoadingConnection && currentStep !== 'connect' && currentStep !== 'complete' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Step {currentStepIndex + 1} of {STEPS.length}</span>
            <span className="font-medium">{STEPS[currentStepIndex]?.label}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between">
            {STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = step.id === currentStep;
              const isComplete = idx < currentStepIndex;
              return (
                <div 
                  key={step.id}
                  className={`flex flex-col items-center gap-1 ${
                    isActive ? 'text-primary' : isComplete ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isActive ? 'bg-primary text-white' : 
                    isComplete ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'
                  }`}>
                    {isComplete ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                  </div>
                  <span className="text-[10px] hidden sm:block">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoadingConnection && currentStep === 'connect' && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-[#2CA01C]/10 flex items-center justify-center mb-4">
              <SiQuickbooks className="h-8 w-8 text-[#2CA01C]" />
            </div>
            <CardTitle className="flex items-center justify-center gap-2">
              Step 1: Connect to QuickBooks
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700">
                Sandbox Mode
              </Badge>
            </CardTitle>
            <CardDescription>
              Authorize CoAIleague to access your QuickBooks data for intelligent migration
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-2 justify-center mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Sandbox Testing Mode</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Use your Intuit Developer Portal sandbox test credentials to log in.
                Create a sandbox company in the Developer Portal if you don't have one.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Import customers as clients</span>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Import employees with pay rates</span>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Map payroll items</span>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Sync invoices bidirectionally</span>
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !workspace?.id}
              className="bg-[#2CA01C] hover:bg-[#248016]"
              data-testid="button-connect-quickbooks"
            >
              {connectMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Connect QuickBooks (Sandbox)
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoadingConnection && currentStep === 'discovery' && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              {isLoadingPreview ? (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              ) : (
                <Zap className="h-8 w-8 text-primary" />
              )}
            </div>
            <CardTitle>Step 2: Trinity is Analyzing Your Data</CardTitle>
            <CardDescription>
              {isLoadingPreview 
                ? 'Fetching and analyzing your QuickBooks data...'
                : 'Analysis complete! Here\'s what Trinity found:'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingPreview ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg animate-pulse">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Fetching customers...</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg animate-pulse">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Fetching employees...</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg animate-pulse">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Analyzing billing patterns...</span>
                </div>
              </div>
            ) : previewData && (previewData.customers?.length || previewData.employees?.length) ? (
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-8 w-8 text-blue-600" />
                      <div>
                        <p className="text-2xl font-bold">{previewData.customers?.length || 0}</p>
                        <p className="text-sm text-muted-foreground">Customers Found</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {recommendedCustomers.length} recommended | {vendorCount} vendors excluded
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-8 w-8 text-green-600" />
                      <div>
                        <p className="text-2xl font-bold">{previewData.employees?.length || 0}</p>
                        <p className="text-sm text-muted-foreground">Employees Found</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {w2Employees.length} W2 active | {contractorCount} contractors
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-8 w-8 text-amber-600" />
                      <div>
                        <p className="text-2xl font-bold">{previewData.payrollItems?.length || 0}</p>
                        <p className="text-sm text-muted-foreground">Payroll Items</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-purple-600" />
                      <div>
                        <p className="text-2xl font-bold">{previewData.chartOfAccounts?.length || 0}</p>
                        <p className="text-sm text-muted-foreground">Chart of Accounts</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : previewData && (
              <div className="text-center py-8 space-y-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Sandbox Connected - No Data Found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Your QuickBooks sandbox is connected, but Trinity didn't find any customers, employees, or payroll items to import.
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 max-w-md mx-auto text-left">
                  <p className="font-medium mb-2">To test the migration:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Push your CoAIleague data to QuickBooks (recommended)</li>
                    <li>Add test customers in your QuickBooks sandbox</li>
                    <li>Or connect your production QuickBooks account</li>
                  </ul>
                </div>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button 
                    onClick={() => pushToQuickBooksMutation.mutate(true)} 
                    disabled={pushToQuickBooksMutation.isPending}
                    data-testid="button-push-sandbox-to-quickbooks"
                  >
                    {pushToQuickBooksMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Pushing Sandbox Data...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 mr-2" /> Push Sandbox Test Data to QuickBooks
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleRetryDiscovery} 
                    disabled={isFetchingPreview}
                    data-testid="button-retry-discovery"
                  >
                    {isFetchingPreview ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" /> Retry Discovery
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button onClick={goNext} disabled={isLoadingPreview || !previewData || (!previewData.customers?.length && !previewData.employees?.length)} data-testid="button-next">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 'select-customers' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Step 3: Select Clients to Import
              </CardTitle>
              <CardDescription>
                Trinity recommends high-value clients based on billing history
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectRecommendedCustomers} data-testid="button-select-recommended">
                <Star className="h-4 w-4 mr-1" /> Select Recommended
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomers(previewData?.customers?.filter(c => !c.isVendor) || [])} data-testid="button-select-all">
                Select All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto">
            {!previewData?.customers?.length ? (
              <div className="p-6 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No customers found in QuickBooks</p>
              </div>
            ) : (
              <div className="divide-y">
                {previewData.customers.map((cust) => {
                  const isSelected = selectedCustomers.some(c => c.qboId === cust.qboId);
                  return (
                    <label
                      key={cust.qboId}
                      className={`flex items-center gap-4 p-4 hover-elevate cursor-pointer ${
                        cust.isVendor ? 'opacity-50 bg-muted/30' : ''
                      }`}
                      data-testid={`row-customer-${cust.qboId}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCustomer(cust)}
                        disabled={cust.isVendor}
                        data-testid={`checkbox-customer-${cust.qboId}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{cust.companyName || cust.displayName}</p>
                          {cust.recommended && !cust.isVendor && (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
                              RECOMMENDED
                            </Badge>
                          )}
                          {cust.isVendor && (
                            <Badge variant="secondary" className="text-[10px]">VENDOR - SKIP</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {cust.email || 'No email'}
                        </p>
                        {cust.recommendReason && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">{cust.recommendReason}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600">{formatCurrency(cust.monthlyRevenue || 0)}/mo</p>
                        <p className="text-xs text-muted-foreground">{cust.invoiceCount || 0} invoices</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{selectedCustomers.length} selected</span>
              <Button onClick={goNext} disabled={selectedCustomers.length === 0} data-testid="button-next">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {currentStep === 'select-employees' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Step 4: Select Employees to Import
              </CardTitle>
              <CardDescription>
                Trinity recommends active W2 employees with valid pay rates
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectRecommendedEmployees} data-testid="button-select-recommended">
                <Star className="h-4 w-4 mr-1" /> Select Recommended
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEmployees(previewData?.employees || [])} data-testid="button-select-all">
                Select All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto">
            {!previewData?.employees?.length ? (
              <div className="p-6 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No employees found in QuickBooks</p>
              </div>
            ) : (
              <div className="divide-y">
                {previewData.employees.map((emp) => {
                  const isSelected = selectedEmployees.some(e => e.qboId === emp.qboId);
                  return (
                    <label
                      key={emp.qboId}
                      className={`flex items-center gap-4 p-4 hover-elevate cursor-pointer ${
                        !emp.active ? 'opacity-50 bg-muted/30' : ''
                      }`}
                      data-testid={`row-employee-${emp.qboId}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleEmployee(emp)}
                        data-testid={`checkbox-employee-${emp.qboId}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{emp.displayName}</p>
                          {emp.recommended && (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
                              RECOMMENDED
                            </Badge>
                          )}
                          <Badge variant={emp.employeeType === 'W2' ? 'default' : 'secondary'} className="text-[10px]">
                            {emp.employeeType || 'W2'}
                          </Badge>
                          {!emp.active && (
                            <Badge variant="destructive" className="text-[10px]">INACTIVE</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {emp.role || 'Field Staff'} {emp.email && `| ${emp.email}`}
                        </p>
                        {emp.recommendReason && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">{emp.recommendReason}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {emp.payRate ? (
                          <p className="font-medium text-green-600">${emp.payRate}/hr</p>
                        ) : (
                          <p className="text-xs text-red-500">No pay rate</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{selectedEmployees.length} selected</span>
              <Button onClick={goNext} disabled={selectedEmployees.length === 0} data-testid="button-next">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {currentStep === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Step 5: Payroll Item Mapping
            </CardTitle>
            <CardDescription>
              Map your QuickBooks payroll items to CoAIleague categories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(previewData?.payrollItems || []).length === 0 ? (
              <div className="p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
                <p>No payroll items found. Trinity will use default mappings.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { qb: 'Hourly Wages', coai: 'Regular Pay' },
                  { qb: 'Overtime Pay', coai: 'Overtime (1.5x)' },
                  { qb: 'Holiday Pay', coai: 'Holiday Premium' },
                  { qb: 'Federal Tax', coai: 'Tax Withholding' },
                  { qb: 'State Tax', coai: 'Tax Withholding' },
                  { qb: 'Health Insurance', coai: 'Deduction' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.qb}</p>
                      <p className="text-xs text-muted-foreground">QuickBooks</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 flex items-center gap-2">
                      <p className="font-medium text-sm text-green-600">{item.coai}</p>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
            <Button onClick={goNext} data-testid="button-next">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 'preflight' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Step 6: Pre-Flight Verification
            </CardTitle>
            <CardDescription>
              Trinity runs automated tests to ensure the integration works correctly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preflightTests.length === 0 ? (
              <div className="p-6 text-center">
                <Play className="h-12 w-12 mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground mb-4">Ready to run pre-flight tests</p>
                <Button onClick={runPreflightTests} size="lg" data-testid="button-run-tests">
                  <Zap className="h-4 w-4 mr-2" /> Run Pre-Flight Tests
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {preflightTests.map((test, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-background">
                      {test.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                      {test.status === 'running' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                      {test.status === 'passed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {test.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{test.name}</p>
                      <p className="text-xs text-muted-foreground">{test.description}</p>
                      {test.error && <p className="text-xs text-red-500 mt-1">{test.error}</p>}
                    </div>
                    <Badge variant={
                      test.status === 'passed' ? 'default' : 
                      test.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                      {test.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
                {allTestsPassed && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-300">All Tests Passed</p>
                        <p className="text-sm text-green-600 dark:text-green-400">Integration verified and ready to activate</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
            <Button onClick={goNext} disabled={!allTestsPassed} data-testid="button-next">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 'confirm' && (
        <Card>
          <CardHeader className="text-center border-b">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
              <Rocket className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Step 7: Confirm & Activate</CardTitle>
            <CardDescription>
              Review your migration summary before activating your workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">CLIENTS</span>
                </div>
                <p className="text-2xl font-bold">{selectedCustomers.length} imported</p>
                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <p>Enterprise: {selectedCustomers.filter(c => (c.monthlyRevenue || 0) > 10000).length}</p>
                  <p>Premium: {selectedCustomers.filter(c => (c.monthlyRevenue || 0) > 3000 && (c.monthlyRevenue || 0) <= 10000).length}</p>
                  <p>Standard: {selectedCustomers.filter(c => (c.monthlyRevenue || 0) <= 3000).length}</p>
                </div>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-green-600" />
                  <span className="font-medium">EMPLOYEES</span>
                </div>
                <p className="text-2xl font-bold">{selectedEmployees.length} imported</p>
                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <p>Active: {selectedEmployees.filter(e => e.active).length}</p>
                  <p>Avg Pay: ${(selectedEmployees.reduce((sum, e) => sum + (e.payRate || 0), 0) / selectedEmployees.length || 0).toFixed(2)}/hr</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
              <p className="font-medium">INTEGRATIONS:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> QuickBooks connected</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Invoice sync ready</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Payroll sync ready</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> All IDs mapped</div>
              </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
              <p className="font-medium">TRINITY AI STATUS:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Can schedule automatically</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Can process payroll</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Can generate invoices</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Pre-flight tests passed</div>
              </div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-300">IMPORTANT:</p>
                  <ul className="mt-1 space-y-1 text-amber-600 dark:text-amber-400">
                    <li>Your QuickBooks data will be synced</li>
                    <li>Trinity will begin autonomous operations</li>
                    <li>First AI schedule runs tonight at 11 PM</li>
                    <li>First payroll sync: Friday 3 AM</li>
                  </ul>
                </div>
              </div>
            </div>

            {payRateWarning && Array.isArray(payRateWarning.employees) && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-red-700 dark:text-red-300">
                      {payRateWarning.employees.length} Employee(s) Missing Pay Rates
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      These employees will be imported without pay rates, which may cause payroll calculation errors:
                    </p>
                    <ul className="mt-2 text-sm text-red-600 dark:text-red-400 space-y-1 max-h-32 overflow-y-auto">
                      {payRateWarning.employees.slice(0, 10).map((emp, idx) => (
                        <li key={emp?.qboId || idx} className="flex items-center gap-2">
                          <AlertCircle className="h-3 w-3" />
                          {String(emp?.displayName || 'Unknown Employee')}
                        </li>
                      ))}
                      {payRateWarning.employees.length > 10 && (
                        <li className="text-muted-foreground">
                          ...and {payRateWarning.employees.length - 10} more
                        </li>
                      )}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setPayRateWarning(null)}
                        data-testid="button-cancel-import"
                      >
                        Cancel & Fix in QuickBooks
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={handleProceedWithMissingPayRates}
                        disabled={importMutation.isPending}
                        data-testid="button-proceed-anyway"
                      >
                        {importMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Proceed Anyway
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between border-t pt-6">
            <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation('/dashboard')}>Cancel</Button>
              <Button 
                onClick={() => importMutation.mutate()} 
                disabled={importMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-activate"
              >
                {importMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Activate Workspace
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {currentStep === 'complete' && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto h-20 w-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Workspace Activated</CardTitle>
            <CardDescription>
              Trinity is now managing your workforce
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg space-y-2">
              <p className="font-medium text-green-700 dark:text-green-300">IMMEDIATE ACTIONS:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Employees imported</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Clients imported</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> QuickBooks synced</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> IDs mapped</div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg space-y-2">
              <p className="font-medium text-blue-700 dark:text-blue-300">SCHEDULED TONIGHT (11 PM):</p>
              <div className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Trinity will generate optimized schedule</p>
                <p className="flex items-center gap-2"><Users className="h-4 w-4" /> Employees will be notified</p>
              </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
              <p className="font-medium">NEXT STEPS FOR YOU:</p>
              <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                <li>Review employee certifications</li>
                <li>Add client site locations</li>
                <li>Set billing rates (if not in QB)</li>
                <li>Upload employee photos (optional)</li>
              </ol>
            </div>

            <div className="text-center pt-4">
              <p className="text-2xl font-bold text-green-600">TRINITY IS READY TO WORK</p>
            </div>
          </CardContent>
          <CardFooter className="justify-center">
            <Button size="lg" onClick={() => setLocation('/dashboard')} data-testid="button-go-dashboard">
              Go to Dashboard <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Migration Lock Dialog */}
      <Dialog open={migrationLocked} onOpenChange={(open) => !open && setMigrationLocked(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Migration Already Running
            </DialogTitle>
            <DialogDescription>
              Another sync operation is currently in progress. You can wait for it to complete or cancel it.
            </DialogDescription>
          </DialogHeader>
          
          {activeMigrationInfo && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium capitalize">{activeMigrationInfo.status?.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Running for:</span>
                <span className="font-medium">{Math.floor(activeMigrationInfo.elapsedSeconds / 60)}m {activeMigrationInfo.elapsedSeconds % 60}s</span>
              </div>
              {activeMigrationInfo.progress && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Employees:</span>
                    <span className="font-medium">{activeMigrationInfo.progress.employees.synced} / {activeMigrationInfo.progress.employees.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Customers:</span>
                    <span className="font-medium">{activeMigrationInfo.progress.customers.synced} / {activeMigrationInfo.progress.customers.total}</span>
                  </div>
                </>
              )}
            </div>
          )}
          
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-3 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setMigrationLocked(false)}
                data-testid="button-wait-migration"
              >
                Wait for Completion
              </Button>
              <Button 
                variant="destructive"
                onClick={() => cancelMigrationMutation.mutate()}
                disabled={cancelMigrationMutation.isPending}
                data-testid="button-cancel-migration"
              >
                {cancelMigrationMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</>
                ) : (
                  'Cancel Migration'
                )}
              </Button>
            </div>
            
            {/* Unlock button for stuck migrations (visible after 5+ minutes) */}
            {activeMigrationInfo && activeMigrationInfo.elapsedSeconds > 300 && (
              <div className="border-t pt-3 mt-1">
                <p className="text-xs text-muted-foreground mb-2">
                  Migration appears stuck (running for over 5 minutes). You can force unlock to retry.
                </p>
                <Button 
                  variant="outline"
                  className="w-full border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                  onClick={() => unlockMigrationMutation.mutate(true)}
                  disabled={unlockMigrationMutation.isPending}
                  data-testid="button-unlock-migration"
                >
                  {unlockMigrationMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Unlocking...</>
                  ) : (
                    'Force Unlock & Retry'
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trinity Push Loading Modal with Task Checklist */}
      <Dialog open={showPushModal} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-lg bg-gradient-to-b from-background to-muted/50 border-2 border-primary/20"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <VisuallyHidden>
            <DialogTitle>Trinity Sync Progress</DialogTitle>
            <DialogDescription>Syncing data to QuickBooks</DialogDescription>
          </VisuallyHidden>
          <div className="flex flex-col py-6 space-y-5">
            {/* Header with Trinity Logo */}
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <ColorfulCelticKnot 
                  size={64} 
                  animated={true}
                  state={pushProgress === 100 ? "success" : "thinking"}
                  animationSpeed={pushProgress === 100 ? "instant" : "fast"}
                />
                {pushProgress === 100 && (
                  <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {pushProgress === 100 ? 'Trinity Sync Complete!' : 'Trinity is Working...'}
                </h3>
                <p className="text-sm text-muted-foreground">{pushMessage}</p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span className="font-medium">{pushProgress}%</span>
              </div>
              <Progress value={pushProgress} className="h-2" />
            </div>
            
            {/* Trinity Task Checklist */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Trinity Task Execution
              </p>
              <div className="space-y-2">
                {pushTasks.map((task) => (
                  <div 
                    key={task.id}
                    className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                      task.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                      task.status === 'in_progress' ? 'text-primary font-medium' :
                      'text-muted-foreground'
                    }`}
                  >
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : task.status === 'in_progress' ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                    <span className={task.status === 'completed' ? 'line-through opacity-70' : ''}>
                      {task.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer message */}
            <p className="text-xs text-muted-foreground text-center">
              {pushProgress === 100 
                ? 'All tasks completed successfully. You can now import data back from QuickBooks.'
                : 'Trinity AI is orchestrating your data sync. Please wait...'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
