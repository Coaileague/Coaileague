import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileCheck, Search, Upload, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function ComplianceEvidencePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // Queries
  const { data: pendingEvidence, isLoading: loadingPending } = useQuery<any[]>({
    queryKey: ["/api/compliance-evidence/pending"],
  });

  const { data: expiringEvidence, isLoading: loadingExpiring } = useQuery<any[]>({
    queryKey: ["/api/compliance-evidence/expiring"],
  });

  const { data: officers } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  // Mutations
  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/compliance-evidence/${id}/verify`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-evidence/pending"] });
      toast({ title: "Evidence Verified", description: "The document has been successfully verified." });
    },
    onError: (error) => {
      toast({ title: "Verification failed", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest("POST", `/api/compliance-evidence/${id}/reject`, { rejectionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-evidence/pending"] });
      toast({ title: "Evidence Rejected", description: "The document has been rejected." });
    },
    onError: (error) => {
      toast({ title: "Rejection failed", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance Evidence Vault</h1>
          <p className="text-muted-foreground">Manage and verify officer compliance documentation.</p>
        </div>
        <Button data-testid="button-submit-evidence">
          <Upload className="mr-2 h-4 w-4" /> Submit Evidence
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="pending">Pending Review</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
          <TabsTrigger value="lookup">Officer Lookup</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Verification</CardTitle>
              <CardDescription>Documents awaiting manager review and approval.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-2">
                  <Clock className="h-8 w-8 opacity-50 animate-pulse" />
                  <p className="font-medium text-foreground">Loading pending evidence</p>
                  <p className="text-sm">Pulling newly submitted documents that still need reviewer action.</p>
                </div>
              ) : pendingEvidence?.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground space-y-2">
                  <CheckCircle2 className="h-8 w-8 mx-auto opacity-50 text-green-600 dark:text-green-400" />
                  <p className="font-medium text-foreground">No pending items for review</p>
                  <p className="text-sm">The evidence queue is clear right now.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingEvidence?.map((item) => (
                    <Card key={item.id} className="hover-elevate">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <Badge variant="outline">{item.evidence_type.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <CardTitle className="text-lg mt-2">{item.officer_name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-2">
                        <div className="aspect-video bg-muted rounded-md flex items-center justify-center mb-4">
                          <FileCheck className="h-12 w-12 text-muted-foreground opacity-20" />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Submitted {format(new Date(item.created_at), 'PP')}</span>
                        </div>
                      </CardContent>
                      <CardFooter className="flex gap-2">
                        <Button 
                          data-testid={`button-verify-${item.id}`}
                          variant="default" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => verifyMutation.mutate(item.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Verify
                        </Button>
                        <Button 
                          data-testid={`button-reject-${item.id}`}
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-destructive"
                          onClick={() => {
                            const reason = prompt("Enter rejection reason:");
                            if (reason) rejectMutation.mutate({ id: item.id, reason });
                          }}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="mr-2 h-4 w-4" /> Reject
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Expiring Documents</CardTitle>
              <CardDescription>Verified documents expiring in the next 90 days.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingExpiring ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-2">
                  <Clock className="h-8 w-8 opacity-50 animate-pulse" />
                  <p className="font-medium text-foreground">Loading expiring documents</p>
                  <p className="text-sm">Checking verified evidence that needs renewal soon.</p>
                </div>
              ) : expiringEvidence?.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground space-y-2">
                  <CheckCircle2 className="h-8 w-8 mx-auto opacity-50 text-green-600 dark:text-green-400" />
                  <p className="font-medium text-foreground">No expiring documents found</p>
                  <p className="text-sm">Verified evidence is currently clear of near-term renewals.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Officer</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiringEvidence?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.officer_name}</TableCell>
                        <TableCell className="capitalize">{item.evidence_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            {format(new Date(item.expiry_date), 'PP')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-warning border-warning">Expiring Soon</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Request Update</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lookup" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="md:col-span-1 h-fit">
              <CardHeader>
                <CardTitle>Find Officer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Officer Name</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="search"
                      placeholder="Search..." 
                      className="pl-8" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2 pt-4">
                  <Label>Quick Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="cursor-pointer">Verified</Badge>
                    <Badge variant="secondary" className="cursor-pointer">Missing</Badge>
                    <Badge variant="secondary" className="cursor-pointer">Expired</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Evidence Overview</CardTitle>
                <CardDescription>Search for an officer to view their compliance portfolio.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Search className="h-12 w-12 mb-4 opacity-20" />
                  <p>Enter an officer's name to see their compliance status.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
