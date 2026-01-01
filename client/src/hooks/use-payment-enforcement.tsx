import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

// GLOBAL STATE - survives all React re-renders and component unmounts
let GLOBAL_MODAL_OPEN = false;
let GLOBAL_MODAL_DATA: PaymentModalState = {
  isOpen: false,
  workspaceName: '',
  reason: '',
  redirectTo: '/org-management'
};

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
  // Initialize from global state
  const [modalState, setModalState] = useState<PaymentModalState>(() => {
    if (GLOBAL_MODAL_OPEN) {
      return { ...GLOBAL_MODAL_DATA, isOpen: true };
    }
    return {
      isOpen: false,
      workspaceName: '',
      reason: '',
      redirectTo: '/org-management'
    };
  });
  
  // Refs to prevent duplicate processing
  const hasHandledRef = useRef(GLOBAL_MODAL_OPEN);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInterceptorSetRef = useRef(false);
  
  // Force re-render to sync with global state
  const [, forceUpdate] = useState(0);

  const handleActivate = useCallback(() => {
    console.log('[PaymentEnforcement] User clicked Activate - navigating to:', modalState.redirectTo);
    // Clear global state
    GLOBAL_MODAL_OPEN = false;
    GLOBAL_MODAL_DATA = { isOpen: false, workspaceName: '', reason: '', redirectTo: '/org-management' };
    // Navigate
    window.location.href = modalState.redirectTo;
  }, [modalState.redirectTo]);

  // Intercept fetch calls - set up ONCE per app lifetime
  useEffect(() => {
    if (fetchInterceptorSetRef.current) {
      return;
    }
    fetchInterceptorSetRef.current = true;
    
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      const url = args[0]?.toString() || '';
      if (!url.includes('/api/')) {
        return response;
      }
      
      if (response.status === 402 || response.status === 404) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json() as PaymentErrorResponse;
          
          if (data.code === 'PAYMENT_REQUIRED' || data.code === 'ORGANIZATION_INACTIVE') {
            console.log('[PaymentEnforcement] Intercepted:', response.status, data.code, 'isOwner:', data.isOwner);
            
            // Already showing modal? Don't process again
            if (GLOBAL_MODAL_OPEN) {
              console.log('[PaymentEnforcement] Modal already open, skipping');
              return response;
            }
            
            // OWNERS: Show modal IMMEDIATELY
            if (data.isOwner === true) {
              console.log('[PaymentEnforcement] Owner detected - showing modal NOW');
              GLOBAL_MODAL_OPEN = true;
              GLOBAL_MODAL_DATA = {
                isOpen: true,
                workspaceName: data.workspaceName || 'Your organization',
                reason: data.reason || 'suspended',
                redirectTo: data.redirectTo || '/org-management'
              };
              hasHandledRef.current = true;
              setModalState({ ...GLOBAL_MODAL_DATA });
              return response;
            }
            
            // NON-OWNERS: Wait grace period then logout
            if (data.isOwner === false && data.forceLogout === true) {
              if (!logoutTimerRef.current) {
                console.log('[PaymentEnforcement] Non-owner - scheduling logout');
                hasHandledRef.current = true;
                logoutTimerRef.current = setTimeout(() => {
                  apiRequest('POST', '/api/auth/logout').finally(() => {
                    window.location.href = '/';
                  });
                }, LOGOUT_GRACE_PERIOD_MS);
              }
            }
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      return response;
    };
  }, []);

  // Keep local state synced with global state
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (GLOBAL_MODAL_OPEN && !modalState.isOpen) {
        console.log('[PaymentEnforcement] Syncing modal state from global');
        setModalState({ ...GLOBAL_MODAL_DATA });
      }
    }, 100);
    return () => clearInterval(syncInterval);
  }, [modalState.isOpen]);

  // Check global state on mount
  useEffect(() => {
    if (GLOBAL_MODAL_OPEN && !modalState.isOpen) {
      setModalState({ ...GLOBAL_MODAL_DATA });
    }
  }, []);

  const isOpen = modalState.isOpen || GLOBAL_MODAL_OPEN;

  return (
    <PaymentModalContext.Provider value={{ showPaymentModal: () => {}, isModalOpen: isOpen }}>
      {children}
      
      {/* Custom Modal - COMPLETELY blocks UI until user clicks OK */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)'
          }}
          data-testid="payment-modal-overlay"
        >
          <div 
            className="bg-background border border-border rounded-lg shadow-2xl p-5 max-w-[300px] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            data-testid="payment-modal-content"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Subscription Inactive
              </h2>
            </div>
            
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              <span className="font-medium text-foreground">{modalState.workspaceName || GLOBAL_MODAL_DATA.workspaceName}</span> is {modalState.reason || GLOBAL_MODAL_DATA.reason}. 
              Please reactivate your subscription to continue.
            </p>
            
            <Button 
              onClick={handleActivate}
              className="w-full"
              size="default"
              data-testid="button-activate-subscription"
            >
              Activate Subscription
            </Button>
          </div>
        </div>
      )}
    </PaymentModalContext.Provider>
  );
}
