import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { apiRequest } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

// Grace period configuration
const STARTUP_GRACE_PERIOD_MS = 3000; // 3 seconds for system to fully load
const DEBOUNCE_DELAY_MS = 500; // 500ms debounce for duplicate triggers

interface PaymentErrorResponse {
  code: 'PAYMENT_REQUIRED' | 'ORGANIZATION_INACTIVE';
  message: string;
  reason: 'suspended' | 'cancelled';
  forceLogout?: boolean;
  redirectTo?: string;
  isOwner?: boolean;
  workspaceName?: string;
}

interface PaymentModalState {
  isOpen: boolean;
  workspaceName: string;
  reason: string;
  redirectTo: string;
}

const PaymentModalContext = createContext<{
  showPaymentModal: (data: PaymentErrorResponse) => void;
  isModalOpen: boolean;
} | null>(null);

export function usePaymentEnforcement() {
  const context = useContext(PaymentModalContext);
  return { 
    showPaymentModal: context?.showPaymentModal,
    isModalOpen: context?.isModalOpen ?? false
  };
}

export function PaymentEnforcementProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<PaymentModalState>({
    isOpen: false,
    workspaceName: '',
    reason: '',
    redirectTo: '/org-management'
  });
  
  // System state tracking
  const isSystemReadyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const hasShownModalRef = useRef(false);
  const startupTimeRef = useRef(Date.now());
  const lastActionTimeRef = useRef(0);

  // Wait for system to be ready before intercepting
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[PaymentEnforcement] System ready after grace period');
      isSystemReadyRef.current = true;
    }, STARTUP_GRACE_PERIOD_MS);
    
    return () => clearTimeout(timer);
  }, []);

  const showPaymentModal = useCallback((data: PaymentErrorResponse) => {
    // Prevent duplicate modals
    if (hasShownModalRef.current || modalState.isOpen) {
      console.log('[PaymentEnforcement] Modal already shown, skipping');
      return;
    }
    
    console.log('[PaymentEnforcement] Showing modal for:', data);
    hasShownModalRef.current = true;
    setModalState({
      isOpen: true,
      workspaceName: data.workspaceName || 'Your organization',
      reason: data.reason || 'suspended',
      redirectTo: data.redirectTo || '/org-management'
    });
  }, [modalState.isOpen]);

  const handleActivate = useCallback(() => {
    window.location.href = modalState.redirectTo;
  }, [modalState.redirectTo]);

  // Debounced action handler
  const handlePaymentAction = useCallback((data: PaymentErrorResponse) => {
    const now = Date.now();
    
    // Check if within startup grace period
    if (now - startupTimeRef.current < STARTUP_GRACE_PERIOD_MS) {
      console.log('[PaymentEnforcement] Still in startup grace period, queuing action');
      // Queue the action to run after grace period
      setTimeout(() => handlePaymentAction(data), STARTUP_GRACE_PERIOD_MS - (now - startupTimeRef.current) + 100);
      return;
    }
    
    // Debounce rapid duplicate actions
    if (now - lastActionTimeRef.current < DEBOUNCE_DELAY_MS) {
      console.log('[PaymentEnforcement] Debouncing duplicate action');
      return;
    }
    lastActionTimeRef.current = now;
    
    // Prevent concurrent processing
    if (isProcessingRef.current) {
      console.log('[PaymentEnforcement] Already processing, skipping');
      return;
    }
    isProcessingRef.current = true;
    
    console.log('[PaymentEnforcement] Processing payment action:', data);
    
    // CRITICAL: Check isOwner FIRST - owners NEVER get logged out
    if (data.isOwner === true) {
      console.log('[PaymentEnforcement] Owner detected - showing modal');
      showPaymentModal(data);
      isProcessingRef.current = false;
      return;
    }
    
    // Only logout if EXPLICITLY non-owner AND forceLogout is true
    if (data.isOwner === false && data.forceLogout === true) {
      console.log('[PaymentEnforcement] Non-owner with forceLogout - logging out after delay');
      // Add small delay to ensure UI has time to render any messages
      setTimeout(() => {
        apiRequest('POST', '/api/auth/logout').finally(() => {
          window.location.href = '/';
        });
      }, 1000);
    } else {
      console.log('[PaymentEnforcement] Ambiguous state - not taking action', data);
    }
    
    isProcessingRef.current = false;
  }, [showPaymentModal]);

  // Intercept fetch calls with grace period protection
  useEffect(() => {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Only intercept API calls
      const url = args[0]?.toString() || '';
      if (!url.includes('/api/')) {
        return response;
      }
      
      // Check for payment-related errors
      if (response.status === 402 || response.status === 404) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json();
          
          // Only process payment/organization codes
          if (data.code === 'PAYMENT_REQUIRED' || data.code === 'ORGANIZATION_INACTIVE') {
            console.log('[PaymentEnforcement] Intercepted:', response.status, data.code, 'isOwner:', data.isOwner);
            handlePaymentAction(data);
          }
        } catch (e) {
          // JSON parse error - ignore
        }
      }
      
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [handlePaymentAction]);

  return (
    <PaymentModalContext.Provider value={{ showPaymentModal, isModalOpen: modalState.isOpen }}>
      {children}
      
      {/* Ultra-compact Payment Modal */}
      <AlertDialog open={modalState.isOpen}>
        <AlertDialogContent 
          className="!max-w-[280px] p-3 gap-2"
          showHomeButton={false}
        >
          <AlertDialogHeader className="gap-1 space-y-0">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <AlertDialogTitle className="text-sm font-medium">
                Subscription Inactive
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs leading-tight">
              {modalState.workspaceName} is {modalState.reason}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-0">
            <AlertDialogAction 
              onClick={handleActivate}
              className="w-full h-7 text-xs"
              data-testid="button-activate-subscription"
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PaymentModalContext.Provider>
  );
}
