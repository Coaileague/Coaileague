import { useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface PaymentErrorResponse {
  code: 'PAYMENT_REQUIRED' | 'ORGANIZATION_INACTIVE';
  message: string;
  reason: 'suspended' | 'cancelled';
  forceLogout?: boolean;
  redirectTo?: string;
  isOwner?: boolean;
  workspaceName?: string;
}

export function usePaymentEnforcement() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handlePaymentError = useCallback((error: PaymentErrorResponse) => {
    console.log('[PaymentEnforcement] Handling error:', error);
    if (error.code === 'PAYMENT_REQUIRED' && error.isOwner) {
      toast({
        title: 'Payment Required',
        description: `Your organization "${error.workspaceName || 'account'}" subscription is inactive. Please update your payment to continue.`,
        variant: 'destructive',
        duration: 8000,
      });
      // Use window.location for reliable redirect
      window.location.href = error.redirectTo || '/org-management';
    } else if (error.code === 'ORGANIZATION_INACTIVE' && error.forceLogout) {
      toast({
        title: 'Organization Unavailable',
        description: 'This organization is currently inactive. You have been logged out.',
        variant: 'destructive',
        duration: 5000,
      });
      apiRequest('POST', '/api/auth/logout').finally(() => {
        window.location.href = '/';
      });
    }
  }, [toast]);

  const checkResponse = useCallback((response: Response) => {
    if (response.status === 402 || response.status === 404) {
      return response.json().then((data: PaymentErrorResponse) => {
        if (data.code === 'PAYMENT_REQUIRED' || data.code === 'ORGANIZATION_INACTIVE') {
          handlePaymentError(data);
          throw new Error(data.message);
        }
        return data;
      });
    }
    return null;
  }, [handlePaymentError]);

  return { handlePaymentError, checkResponse };
}

export function PaymentEnforcementProvider({ children }: { children: React.ReactNode }) {
  const { handlePaymentError } = usePaymentEnforcement();

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      if ((response.status === 402 || response.status === 404) && 
          args[0]?.toString().includes('/api/')) {
        const clonedResponse = response.clone();
        try {
          const data = await clonedResponse.json();
          if (data.code === 'PAYMENT_REQUIRED' || data.code === 'ORGANIZATION_INACTIVE') {
            handlePaymentError(data);
          }
        } catch {
        }
      }
      
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [handlePaymentError]);

  return <>{children}</>;
}
