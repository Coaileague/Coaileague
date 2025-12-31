import { useState, useEffect, useCallback, createContext, useContext } from 'react';
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
import { AlertTriangle, CreditCard } from 'lucide-react';

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
} | null>(null);

export function usePaymentEnforcement() {
  const context = useContext(PaymentModalContext);
  
  const handlePaymentError = useCallback((error: PaymentErrorResponse) => {
    console.log('[PaymentEnforcement] Handling error:', error);
    
    if (error.code === 'PAYMENT_REQUIRED' && error.isOwner) {
      // Show modal for owners
      if (context?.showPaymentModal) {
        context.showPaymentModal(error);
      } else {
        // Fallback if context not available
        window.location.href = error.redirectTo || '/org-management';
      }
    } else if (error.code === 'ORGANIZATION_INACTIVE' && error.forceLogout) {
      // End user - force logout
      apiRequest('POST', '/api/auth/logout').finally(() => {
        window.location.href = '/';
      });
    }
  }, [context]);

  return { handlePaymentError };
}

export function PaymentEnforcementProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<PaymentModalState>({
    isOpen: false,
    workspaceName: '',
    reason: '',
    redirectTo: '/org-management'
  });

  const showPaymentModal = useCallback((data: PaymentErrorResponse) => {
    console.log('[PaymentEnforcement] Showing modal for:', data);
    setModalState({
      isOpen: true,
      workspaceName: data.workspaceName || 'your organization',
      reason: data.reason || 'suspended',
      redirectTo: data.redirectTo || '/org-management'
    });
  }, []);

  const handleActivate = useCallback(() => {
    window.location.href = modalState.redirectTo;
  }, [modalState.redirectTo]);

  // Intercept fetch calls
  useEffect(() => {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Check for payment-related errors on API calls
      if ((response.status === 402 || response.status === 404) && 
          args[0]?.toString().includes('/api/')) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json();
          console.log('[PaymentEnforcement] Intercepted response:', data);
          
          if (data.code === 'PAYMENT_REQUIRED' && data.isOwner) {
            // Owner with payment issue - show modal
            setModalState({
              isOpen: true,
              workspaceName: data.workspaceName || 'your organization',
              reason: data.reason || 'suspended',
              redirectTo: data.redirectTo || '/org-management'
            });
          } else if (data.code === 'ORGANIZATION_INACTIVE' && data.forceLogout) {
            // End user - force logout
            apiRequest('POST', '/api/auth/logout').finally(() => {
              window.location.href = '/';
            });
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
  }, []);

  return (
    <PaymentModalContext.Provider value={{ showPaymentModal }}>
      {children}
      
      {/* Payment Required Modal */}
      <AlertDialog open={modalState.isOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-destructive/10 rounded-full">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl">
                Subscription Inactive
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              <strong>{modalState.workspaceName}</strong>'s subscription has been {modalState.reason === 'cancelled' ? 'cancelled' : 'suspended'}.
              <br /><br />
              To continue using CoAIleague, please reactivate your subscription.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogAction 
              onClick={handleActivate}
              className="w-full gap-2"
              data-testid="button-activate-subscription"
            >
              <CreditCard className="h-4 w-4" />
              Activate Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PaymentModalContext.Provider>
  );
}
