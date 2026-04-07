import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOGOUT_GRACE_PERIOD_MS = 5000;
const STORAGE_KEY = 'coaileague_payment_modal';

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
  timestamp: number;
}

// Persist to localStorage for bulletproof persistence
function getStoredModalState(): PaymentModalState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PaymentModalState;
      // Only valid for 30 minutes
      if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
        return parsed;
      }
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {}
  return null;
}

function setStoredModalState(state: PaymentModalState | null) {
  try {
    if (state && state.isOpen) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {}
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
  const [modalState, setModalState] = useState<PaymentModalState>(() => {
    const stored = getStoredModalState();
    return stored || {
      isOpen: false,
      workspaceName: '',
      reason: '',
      redirectTo: '/org-management',
      timestamp: 0
    };
  });
  
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInterceptorSetRef = useRef(false);

  const handleActivate = useCallback(() => {
    setStoredModalState(null);
    setModalState(prev => ({ ...prev, isOpen: false }));
    window.location.href = modalState.redirectTo;
  }, [modalState.redirectTo]);

  // Sync to localStorage whenever modal opens
  useEffect(() => {
    if (modalState.isOpen) {
      setStoredModalState(modalState);
    }
  }, [modalState]);

  // Check localStorage on mount and periodically
  useEffect(() => {
    const checkStorage = () => {
      const stored = getStoredModalState();
      if (stored && stored.isOpen && !modalState.isOpen) {
        setModalState(stored);
      }
    };
    
    checkStorage();
    const interval = setInterval(checkStorage, 500);
    return () => clearInterval(interval);
  }, [modalState.isOpen]);

  // Intercept fetch calls
  useEffect(() => {
    if (fetchInterceptorSetRef.current) return;
    fetchInterceptorSetRef.current = true;
    
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      const url = args[0]?.toString() || '';
      if (!url.includes('/api/')) return response;
      
      // Clear payment modal if auth succeeds (workspace is now active/valid trial)
      if (url.includes('/api/auth/me') && response.status === 200) {
        const existingModal = getStoredModalState();
        if (existingModal?.isOpen) {
          setStoredModalState(null);
          setModalState(prev => ({ ...prev, isOpen: false }));
        }
        return response;
      }
      
      if (response.status === 402 || response.status === 404) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json() as PaymentErrorResponse;
          
          if (data.code === 'PAYMENT_REQUIRED' || data.code === 'ORGANIZATION_INACTIVE') {
            const existingModal = getStoredModalState();
            if (existingModal?.isOpen) {
              return response;
            }
            
            if (data.isOwner === true) {
              const newState: PaymentModalState = {
                isOpen: true,
                workspaceName: data.workspaceName || 'Your organization',
                reason: data.reason || 'suspended',
                redirectTo: data.redirectTo || '/org-management',
                timestamp: Date.now()
              };
              setStoredModalState(newState);
              setModalState(newState);
              return response;
            }
            
            if (data.isOwner === false && data.forceLogout === true) {
              if (!logoutTimerRef.current) {
                logoutTimerRef.current = setTimeout(() => {
                  apiRequest('POST', '/api/auth/logout').finally(() => {
                    window.location.href = '/';
                  });
                }, LOGOUT_GRACE_PERIOD_MS);
              }
            }
          }
        } catch (e) {}
      }
      
      return response;
    };

    // Cleanup: restore original fetch on unmount
    return () => {
      window.fetch = originalFetch;
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };
  }, []);

  const isOpen = modalState.isOpen || !!getStoredModalState()?.isOpen;

  return (
    <PaymentModalContext.Provider value={{ showPaymentModal: () => {}, isModalOpen: isOpen }}>
      {children}
      
      {/* Compact Payment Modal - ULTRA persistent via localStorage */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)'
          }}
          data-testid="payment-modal-overlay"
        >
          <div 
            className="bg-background border border-border rounded-lg shadow-2xl w-full"
            style={{ maxWidth: '260px', padding: '16px' }}
            onClick={(e) => e.stopPropagation()}
            data-testid="payment-modal-content"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <h2 className="text-sm font-semibold text-foreground">
                Subscription Inactive
              </h2>
            </div>
            
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              <span className="font-medium text-foreground">{modalState.workspaceName || getStoredModalState()?.workspaceName}</span> is {modalState.reason || getStoredModalState()?.reason}. 
              Reactivate to continue.
            </p>
            
            <Button 
              onClick={handleActivate}
              className="w-full h-8 text-sm"
              data-testid="button-activate-subscription"
            >
              OK
            </Button>
          </div>
        </div>
      )}
    </PaymentModalContext.Provider>
  );
}
