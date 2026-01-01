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
import { AlertTriangle, Loader2 } from 'lucide-react';

// Grace period only for LOGOUT actions - owners see modal immediately
const LOGOUT_GRACE_PERIOD_MS = 5000; // 5 seconds before any logout

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
  
  // Prevent duplicate processing
  const hasHandledRef = useRef(false);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleActivate = useCallback(() => {
    console.log('[PaymentEnforcement] Navigating to:', modalState.redirectTo);
    window.location.href = modalState.redirectTo;
  }, [modalState.redirectTo]);

  // Intercept fetch calls
  useEffect(() => {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Only intercept API calls
      const url = args[0]?.toString() || '';
      if (!url.includes('/api/')) {
        return response;
      }
      
      // Check for payment-related errors (402 or 404)
      if (response.status === 402 || response.status === 404) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json() as PaymentErrorResponse;
          
          // Only process payment/organization codes
          if (data.code === 'PAYMENT_REQUIRED' || data.code === 'ORGANIZATION_INACTIVE') {
            console.log('[PaymentEnforcement] Intercepted:', response.status, data.code, 'isOwner:', data.isOwner);
            
            // Prevent duplicate handling
            if (hasHandledRef.current) {
              console.log('[PaymentEnforcement] Already handled, skipping');
              return response;
            }
            
            // OWNERS: Show modal IMMEDIATELY - no delay
            if (data.isOwner === true) {
              console.log('[PaymentEnforcement] Owner detected - showing modal NOW');
              hasHandledRef.current = true;
              setModalState({
                isOpen: true,
                workspaceName: data.workspaceName || 'Your organization',
                reason: data.reason || 'suspended',
                redirectTo: data.redirectTo || '/org-management'
              });
              return response;
            }
            
            // NON-OWNERS: Wait grace period then logout
            if (data.isOwner === false && data.forceLogout === true) {
              if (!logoutTimerRef.current) {
                console.log('[PaymentEnforcement] Non-owner - scheduling logout in', LOGOUT_GRACE_PERIOD_MS, 'ms');
                hasHandledRef.current = true;
                logoutTimerRef.current = setTimeout(() => {
                  console.log('[PaymentEnforcement] Grace period over - logging out');
                  apiRequest('POST', '/api/auth/logout').finally(() => {
                    window.location.href = '/';
                  });
                }, LOGOUT_GRACE_PERIOD_MS);
              }
            }
          }
        } catch (e) {
          // JSON parse error - ignore
        }
      }
      
      return response;
    };

    return () => {
      window.fetch = originalFetch;
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
      }
    };
  }, []);

  return (
    <PaymentModalContext.Provider value={{ showPaymentModal: () => {}, isModalOpen: modalState.isOpen }}>
      {/* Show children normally - modal overlays on top */}
      {children}
      
      {/* Ultra-compact Payment Modal - blocks all interaction until resolved */}
      <AlertDialog open={modalState.isOpen}>
        <AlertDialogContent 
          className="!max-w-[280px] p-4 gap-3"
          showHomeButton={false}
        >
          <AlertDialogHeader className="gap-2 space-y-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <AlertDialogTitle className="text-sm font-semibold">
                Subscription Inactive
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs leading-relaxed">
              <span className="font-medium">{modalState.workspaceName}</span> is {modalState.reason}. 
              Click below to reactivate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-1">
            <AlertDialogAction 
              onClick={handleActivate}
              className="w-full h-8 text-sm font-medium"
              data-testid="button-activate-subscription"
            >
              Activate Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PaymentModalContext.Provider>
  );
}
