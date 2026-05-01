import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, Plus, FileText, CheckCircle2, XCircle, AlertTriangle, Trash2 } from "lucide-react";
import { format } from "date-fns";

const policySchema = z.object({
  policyType: z.enum([
    "general_liability",
    "workers_compensation",
    "professional_liability",
    "commercial_auto",
    "umbrella",
    "crime_fidelity_bond",
    "cyber_liability",
    "other",
  ]),
  carrierName: z.string().min(1, "Carrier name is required"),
  policyNumber: z.string().optional(),
  coverageAmount: z.coerce.number().min(0),
  effectiveDate: z.string().min(1, "Effective date is required"),
  expirationDate: z.string().min(1, "Expiration date is required"),
  premiumAmount: z.coerce.number().min(0).optional(),
  certificateUrl: z.string().url().optional().or(z.literal("")),
  namedInsured: z.string().optional(),
});

type PolicyFormValues = z.infer<typeof policySchema>;

export default function InsurancePage() {
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certRequestText, setCertRequestText] = useState("");

  const { data: policies, isLoading: policiesLoading } = useQuery<any[]>({
    queryKey: ["/api/insurance/policies"],
  });

  const { data: compliance, isLoading: complianceLoading } = useQuery<any>({
    queryKey: ["/api/insurance/compliance"],
  });

  const createPolicyMutation = useMutation({
    mutationFn: (values: PolicyFormValues) =>
      apiRequest("POST", "/api/insurance/policies", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insurance/compliance"] });
      toast({ title: "Policy added successfully" });
      setIsAddModalOpen(false);
    },
    onError: (error) => {
      toast({ title: "Failed to add policy", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/insurance/policies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insurance/compliance"] });
      toast({ title: "Policy removed" });
    },
    onError: (error) => {
      toast({ title: "Failed to remove policy", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const generateCertMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/insurance/certificates/generate"),
    onSuccess: (data: { letterText: string }) => {
      setCertRequestText(data.letterText);
      setIsCertModalOpen(true);
    },
    onError: (error) => {
      toast({ title: "Failed to generate certificate", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      policyType: "general_liability",
      carrierName: "",
      coverageAmount: 0,
      effectiveDate: format(new Date(), "yyyy-MM-dd"),
      expirationDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd"),
      certificateUrl: "",
    },
  });

  const onSubmit = (values: PolicyFormValues) => {
    createPolicyMutation.mutate(values);
  };

  const stats = {
    total: policies?.length || 0,
    active: policies?.filter((p) => p.status === "active").length || 0,
    expiring: policies?.filter((p) => p.status === "expiring").length || 0,
    expired: policies?.filter((p) => p.status === "expired").length || 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Insurance & Coverage</h1>
          <p className="text-muted-foreground">Manage your insurance policies and compliance status.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => generateCertMutation.mutate()}
            disabled={generateCertMutation.isPending}
            data-testid="button-generate-cert"
          >
            <FileText className="mr-2 h-4 w-4" />
            Generate Request
          </Button>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-policy">
                <Plus className="mr-2 h-4 w-4" />
                Add Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Insurance Policy</DialogTitle>
                <DialogDescription>Enter the details of your insurance policy here.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="policyType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Policy Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="general_liability">General Liability</SelectItem>
                              <SelectItem value="workers_compensation">Workers Compensation</SelectItem>
                              <SelectItem value="professional_liability">Professional Liability</SelectItem>
                              <SelectItem value="commercial_auto">Commercial Auto</SelectItem>
                              <SelectItem value="umbrella">Umbrella</SelectItem>
                              <SelectItem value="crime_fidelity_bond">Crime & Fidelity Bond</SelectItem>
                              <SelectItem value="cyber_liability">Cyber Liability</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="carrierName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Carrier Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Hartford" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="policyNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Policy Number</FormLabel>
                          <FormControl>
                            <Input placeholder="POL-12345" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="coverageAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Coverage Amount ($)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="effectiveDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Effective Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expirationDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="certificateUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certificate URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createPolicyMutation.isPending}>
                    {createPolicyMutation.isPending ? "Adding..." : "Add Policy"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-policies">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500" data-testid="text-active-policies">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500" data-testid="text-expiring-policies">{stats.expiring}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500" data-testid="text-expired-policies">{stats.expired}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold">Insurance Policies</h2>
          {policiesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse h-40" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies?.map((policy) => (
                <Card key={policy.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge variant={
                        policy.status === 'active' ? 'default' : 
                        policy.status === 'expiring' ? 'secondary' : 'destructive'
                      }>
                        {policy.policy_type.replace(/_/g, ' ')}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={() => deletePolicyMutation.mutate(policy.id)}
                        data-testid={`button-delete-policy-${policy.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardTitle className="mt-2">{policy.carrier_name}</CardTitle>
                    <CardDescription>Policy: {policy.policy_number || 'N/A'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Coverage:</span>
                        <span className="font-medium">${Number(policy.coverage_amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Expires:</span>
                        <span className="font-medium">{format(new Date(policy.expiration_date), "MMM d, yyyy")}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className={`font-medium ${policy.days_remaining <= 30 ? 'text-amber-500' : ''}`}>
                          {policy.days_remaining} days
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {policies?.length === 0 && (
                <div className="col-span-2 text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  No insurance policies found. Add your first policy to track coverage.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5 text-primary" />
                Coverage Compliance
              </CardTitle>
              <CardDescription>Status of mandatory insurance types</CardDescription>
            </CardHeader>
            <CardContent>
              {complianceLoading ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary mb-1">{(compliance as any)?.complianceScore}%</div>
                    <div className="text-sm text-muted-foreground">Compliance Score</div>
                  </div>
                  <div className="space-y-3">
                    {compliance?.requiredTypes.map((type: string) => {
                      const isCovered = compliance.coveredTypes.includes(type);
                      const isExpired = compliance.expiredTypes.includes(type);
                      return (
                        <div key={type} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <span className="text-sm font-medium capitalize">{type.replace(/_/g, ' ')}</span>
                          {isCovered ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : isExpired ? (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-destructive" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isCertModalOpen} onOpenChange={setIsCertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Certificate Request Letter</DialogTitle>
            <DialogDescription>Copy this text and send it to your insurance agent.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md font-mono text-sm whitespace-pre-wrap">
            {certRequestText}
          </div>
          <Button onClick={() => {
            navigator.clipboard.writeText(certRequestText);
            toast({ title: "Copied to clipboard" });
          }}>
            Copy to Clipboard
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
