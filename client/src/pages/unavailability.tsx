import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TimeOffRequest {
  id: string;
  startDate: string;
  endDate: string;
  requestType: string;
  reason: string | null;
  status: string;
  totalDays: number | null;
  createdAt: string;
}

export default function Unavailability() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState("vacation");

  const { data: entries = [], isLoading } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/time-off-requests/my'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string; requestType: string; reason: string }) => {
      return apiRequest('POST', '/api/time-off-requests', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-off-requests/my'] });
      toast({ title: "Time off request submitted", description: "Your request is pending approval" });
      setDialogOpen(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      setType("vacation");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit request", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!startDate || !endDate) {
      toast({ title: "Missing dates", description: "Please select start and end dates", variant: "destructive" });
      return;
    }
    createMutation.mutate({ startDate, endDate, requestType: type, reason });
  };

  const getTypeColor = (requestType: string) => {
    switch (requestType) {
      case "vacation": return "bg-blue-500/10 text-blue-500 dark:text-blue-400";
      case "sick": return "bg-red-500/10 text-red-500 dark:text-red-400";
      case "personal": return "bg-purple-500/10 text-purple-500 dark:text-purple-400";
      default: return "bg-gray-500/10 text-gray-500 dark:text-gray-400";
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "approved": return "default";
      case "denied": return "destructive";
      default: return "secondary";
    }
  };

  const headerAction = (
    <UniversalModal open={dialogOpen} onOpenChange={setDialogOpen}>
      <UniversalModalTrigger asChild>
        <Button data-testid="button-add-unavailability">
          <Plus className="h-4 w-4 mr-2" />
          {!isMobile && "Add Unavailability"}
        </Button>
      </UniversalModalTrigger>
      <UniversalModalContent data-testid="dialog-add-unavailability">
        <UniversalModalHeader>
          <UniversalModalTitle>Request Time Off</UniversalModalTitle>
          <UniversalModalDescription>
            Mark dates when you'll be unavailable for scheduling
          </UniversalModalDescription>
        </UniversalModalHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className="w-full mt-1 rounded-md border bg-background px-3 py-2"
              value={type}
              onChange={(e) => setType(e.target.value)}
              data-testid="select-type"
            >
              <option value="vacation">Vacation</option>
              <option value="sick">Sick Leave</option>
              <option value="personal">Personal</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="Provide additional details..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-reason"
            />
          </div>
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit">
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'unavailability',
    title: 'Unavailability Calendar',
    subtitle: 'Manage your time off requests and unavailable dates',
    category: 'operations',
    headerActions: headerAction,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                No unavailability periods scheduled
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Add your time off requests to prevent scheduling conflicts
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => (
              <Card key={entry.id} data-testid={`card-timeoff-${entry.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <CardTitle className="text-lg">
                          {format(new Date(entry.startDate), "MMM d, yyyy")} - {format(new Date(entry.endDate), "MMM d, yyyy")}
                        </CardTitle>
                        <Badge className={getTypeColor(entry.requestType)}>
                          {entry.requestType.charAt(0).toUpperCase() + entry.requestType.slice(1)}
                        </Badge>
                        <Badge variant={getStatusVariant(entry.status) as any}>
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </Badge>
                      </div>
                      {entry.totalDays && (
                        <p className="text-sm text-muted-foreground">{entry.totalDays} day{entry.totalDays !== 1 ? 's' : ''}</p>
                      )}
                      {entry.reason && (
                        <CardDescription className="mt-1">{entry.reason}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </CanvasHubPage>
  );
}
