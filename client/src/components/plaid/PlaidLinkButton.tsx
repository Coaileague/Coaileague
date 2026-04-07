import { useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Landmark, Loader2, RefreshCw } from "lucide-react";

interface PlaidLinkButtonProps {
  mode: "org" | "employee";
  employeeId?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  onSuccess?: (data: { institutionName: string; mask: string }) => void;
  disabled?: boolean;
}

export function PlaidLinkButton({
  mode,
  employeeId,
  label,
  variant = "outline",
  size = "default",
  onSuccess,
  disabled,
}: PlaidLinkButtonProps) {
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const exchangeMutation = useMutation({
    mutationFn: async (publicToken: string) => {
      const url =
        mode === "org"
          ? "/api/plaid/exchange/org"
          : `/api/plaid/exchange/employee/${employeeId}`;
      const res = await apiRequest("POST", url, { publicToken });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bank account connected",
        description: `${data.institutionName} (...${data.mask}) linked successfully.`,
      });
      if (mode === "org") {
        queryClient.invalidateQueries({ queryKey: ["/api/plaid/status"] });
      } else {
        queryClient.invalidateQueries({
          queryKey: ["/api/plaid/employee", employeeId, "bank-status"],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/plaid/status"] });
      }
      onSuccess?.(data);
    },
    onError: (err: any) => {
      toast({
        title: "Link failed",
        description: err.message || "Failed to connect bank account.",
        variant: "destructive",
      });
    },
  });

  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (publicToken) => {
      exchangeMutation.mutate(publicToken);
    },
    onExit: (err) => {
      if (err) {
        toast({
          title: "Bank link cancelled",
          description: err.display_message || "Connection was not completed.",
          variant: "destructive",
        });
      }
    },
  });

  const handleClick = useCallback(async () => {
    if (linkToken && ready) {
      open();
      return;
    }
    try {
      setFetching(true);
      const url =
        mode === "org"
          ? "/api/plaid/link-token/org"
          : `/api/plaid/link-token/employee/${employeeId}`;
      const res = await apiRequest("POST", url, {});
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLinkToken(data.linkToken);
      // usePlaidLink will re-initialize; open on next render when ready
    } catch (err: any) {
      toast({
        title: "Could not start bank link",
        description: err.message || "Plaid service unavailable.",
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  }, [linkToken, ready, open, mode, employeeId, toast]);

  // Auto-open once token is set and Plaid is ready
  const handleOpenWhenReady = useCallback(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  if (linkToken && ready) {
    handleOpenWhenReady();
  }

  const isLoading = fetching || exchangeMutation.isPending;
  const defaultLabel =
    mode === "org" ? "Connect Funding Account" : "Connect Direct Deposit";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isLoading}
      data-testid={`button-plaid-link-${mode}`}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Landmark className="w-4 h-4 mr-2" />
      )}
      {label || defaultLabel}
    </Button>
  );
}

interface PlaidRelinkButtonProps {
  mode: "org" | "employee";
  employeeId?: string;
  onSuccess?: (data: { institutionName: string; mask: string }) => void;
}

export function PlaidRelinkButton({
  mode,
  employeeId,
  onSuccess,
}: PlaidRelinkButtonProps) {
  return (
    <PlaidLinkButton
      mode={mode}
      employeeId={employeeId}
      label="Re-link Account"
      variant="ghost"
      size="sm"
      onSuccess={onSuccess}
    />
  );
}
