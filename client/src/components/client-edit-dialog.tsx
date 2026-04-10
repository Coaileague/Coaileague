import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Building2 } from "lucide-react";
import { CoAIleagueLogo } from "./coaileague-logo";

interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

interface ClientEditDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientEditDialog({
  client,
  open,
  onOpenChange,
}: ClientEditDialogProps) {
  const [formData, setFormData] = useState<Client>(
    client || {
      id: '',
      name: '',
      email: undefined,
      phone: undefined,
      address: undefined,
      notes: undefined,
    }
  );
  const { toast } = useToast();

  // Track unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!client) return false;
    return (
      formData.name !== client.name ||
      formData.email !== client.email ||
      formData.phone !== client.phone ||
      formData.address !== client.address ||
      formData.notes !== client.notes
    );
  }, [formData, client]);

  // Warn before closing with unsaved changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Discard them?");
      if (!confirmed) return;
    }
    onOpenChange(newOpen);
  };

  // Reset form when dialog opens with new client
  useEffect(() => {
    if (open && client) {
      setFormData(client);
    }
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return apiRequest(`/api/clients/${formData.id}`, {
        method: 'PATCH',
        body: formData,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Client Updated',
        description: `${formData.name} has been updated successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update client',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <CoAIleagueLogo width={160} height={40} showTagline={false} />
          </div>
          <DialogTitle className="flex items-center justify-center gap-2 text-base">
            <Building2 className="w-4 h-4" />
            Edit Client
          </DialogTitle>
          <DialogDescription className="text-sm">
            Update client information and details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Client Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Client name"
              data-testid="input-client-name"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Email address"
              data-testid="input-client-email"
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Phone number"
              data-testid="input-client-phone"
            />
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Street address"
              data-testid="input-client-address"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              className="min-h-24"
              data-testid="textarea-client-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !formData.name}
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="button-save-client"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
