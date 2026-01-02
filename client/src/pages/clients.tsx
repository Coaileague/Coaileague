import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCreateClient } from "@/hooks/useClients";
import { useQBTerminology } from "@/hooks/useQBTerminology";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientsTable } from "@/components/clients-table";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Clients() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const qb = useQBTerminology();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
    address: "",
    billingEmail: "",
    notes: "",
    // Billing information
    billableRate: "",
    serviceType: "",
    billingCycle: "monthly", // weekly, bi-weekly, monthly
  });

  const createMutation = useCreateClient();

  const handleSubmit = () => {
    // Validate required fields
    if (!formData.firstName || !formData.lastName) {
      toast({
        title: "Validation Error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email) {
      toast({
        title: "Validation Error",
        description: "Email is required for client communication",
        variant: "destructive",
      });
      return;
    }

    if (!formData.billableRate || parseFloat(formData.billableRate) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid hourly rate greater than $0",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate(formData, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: `${qb.entity('client')} added successfully`,
        });
        setIsAddDialogOpen(false);
        setFormData({
          firstName: "",
          lastName: "",
          companyName: "",
          email: "",
          phone: "",
          address: "",
          billingEmail: "",
          notes: "",
          billableRate: "",
          serviceType: "",
          billingCycle: "monthly",
        });
      },
      onError: (error: Error) => {
        if (isUnauthorizedError(error)) {
          toast({
            title: "Unauthorized",
            description: "You are logged out. Logging in again...",
            variant: "destructive",
          });
          setTimeout(() => {
            window.location.href = "/api/login";
          }, 500);
          return;
        }
        toast({
          title: "Error",
          description: error.message || `Failed to create ${qb.entity('client').toLowerCase()}`,
          variant: "destructive",
        });
      },
    });
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mobile-flex-col">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-clients-title">
                {qb.entity('clients')}
              </h2>
              <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]" data-testid="text-clients-subtitle">
                Manage your {qb.entity('clients').toLowerCase()} and their service locations
              </p>
            </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-client">
                <Plus className="mr-2 h-4 w-4" />
                Add {qb.entity('client')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New {qb.entity('client')}</DialogTitle>
                <DialogDescription>
                  Enter {qb.entity('client').toLowerCase()} contact and billing details
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input 
                      id="firstName" 
                      placeholder="Jane" 
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      data-testid="input-client-firstname" 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input 
                      id="lastName" 
                      placeholder="Smith" 
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      data-testid="input-client-lastname" 
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name (Optional)</Label>
                  <Input 
                    id="companyName" 
                    placeholder="Acme Inc." 
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    data-testid="input-client-company" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="jane@example.com" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid="input-client-email" 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input 
                      id="phone" 
                      placeholder="+1 (555) 123-4567" 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid="input-client-phone" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address (Optional)</Label>
                  <Textarea 
                    id="address" 
                    placeholder="123 Main St, City, State 12345" 
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-client-address" 
                  />
                </div>

                {/* Billing Information Section */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-4">
                    Billing Information
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 mobile-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="billableRate">Hourly Rate ($) *</Label>
                        <Input 
                          id="billableRate" 
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="75.00" 
                          value={formData.billableRate}
                          onChange={(e) => setFormData({ ...formData, billableRate: e.target.value })}
                          data-testid="input-client-rate" 
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="billingCycle">Billing Cycle</Label>
                        <Select 
                          value={formData.billingCycle}
                          onValueChange={(value) => setFormData({ ...formData, billingCycle: value })}
                        >
                          <SelectTrigger id="billingCycle" data-testid="select-billing-cycle">
                            <SelectValue placeholder="Select cycle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="serviceType">Service Type</Label>
                      <Input 
                        id="serviceType" 
                        placeholder="e.g., Consulting, IT Support, Maintenance" 
                        value={formData.serviceType}
                        onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                        data-testid="input-client-service" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="billingEmail">Billing Email</Label>
                      <Input 
                        id="billingEmail" 
                        type="email" 
                        placeholder="billing@example.com (defaults to contact email)" 
                        value={formData.billingEmail}
                        onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
                        data-testid="input-client-billing-email" 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea 
                    id="notes" 
                    placeholder="Any special requirements or notes..." 
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    data-testid="input-client-notes" 
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  data-testid="button-save-client"
                >
                  {createMutation.isPending ? "Saving..." : `Save ${qb.entity('client')}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <ClientsTable />
      </div>
    </div>
  );
}
