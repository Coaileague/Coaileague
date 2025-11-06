import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  MessageSquare,
  Eye,
  Clock,
  MoreVertical,
  Users,
  Mail,
  Phone,
  MapPin,
  Calendar,
} from "lucide-react";
import type { Shift } from "@shared/schema";
import moment from "moment";

interface ShiftActionsMenuProps {
  shift: Shift;
}

export function ShiftActionsMenu({ shift }: ShiftActionsMenuProps) {
  const [showCreateChat, setShowCreateChat] = useState(false);
  const [showAuditData, setShowAuditData] = useState(false);
  const { toast } = useToast();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20"
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-shift-actions-${shift.id}`}
          >
            <MoreVertical className="h-4 w-4 text-white" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setShowCreateChat(true);
            }}
            data-testid="menu-create-chat"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Create Chat
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setShowAuditData(true);
            }}
            data-testid="menu-view-audit"
          >
            <Eye className="mr-2 h-4 w-4" />
            View Audit Data
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              toast({
                title: "Clock In/Out",
                description: "Use Time Tracking page for clock in/out functionality",
              });
            }}
            data-testid="menu-clock-inout"
          >
            <Clock className="mr-2 h-4 w-4" />
            Clock In/Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Chat Dialog */}
      <CreateChatDialog
        shift={shift}
        open={showCreateChat}
        onOpenChange={setShowCreateChat}
      />

      {/* Audit Data Dialog */}
      <AuditDataDialog
        shift={shift}
        open={showAuditData}
        onOpenChange={setShowAuditData}
      />
    </>
  );
}

// Create Chat Dialog Component
function CreateChatDialog({
  shift,
  open,
  onOpenChange,
}: {
  shift: Shift;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [chatSubject, setChatSubject] = useState("");
  const [chatType, setChatType] = useState("employee_to_employee");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const { toast } = useToast();

  // Fetch workspace employees for participant selection
  const { data: employees, isLoading: loadingEmployees, error: employeesError } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    enabled: open,
  });

  const createChatMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/chats/create", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Chat Created",
        description: "Chatroom created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create chat",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setChatSubject("");
    setChatType("employee_to_employee");
    setSelectedParticipants([]);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
  };

  const handleCreateChat = () => {
    // Validation: require at least one participant or guest
    if (selectedParticipants.length === 0 && !guestEmail) {
      toast({
        title: "Participants Required",
        description: "Please select at least one participant or add a guest invitation",
        variant: "destructive",
      });
      return;
    }

    const guestInvitations = guestEmail
      ? [{ name: guestName, email: guestEmail, phone: guestPhone, expiresInDays: 7 }]
      : [];

    createChatMutation.mutate({
      subject: chatSubject || `Shift Chat - ${moment(shift.startTime).format("MMM DD, YYYY")}`,
      chatType,
      shiftId: shift.id,
      participantIds: selectedParticipants,
      guestInvitations,
      conversationType: "shift_chat",
    });
  };

  const toggleParticipant = (employeeId: string) => {
    setSelectedParticipants(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shift Chat</DialogTitle>
          <DialogDescription>
            Create a chatroom for this shift. You can invite team members or customers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Chat Subject */}
          <div className="space-y-2">
            <Label htmlFor="chat-subject">Chat Subject</Label>
            <Input
              id="chat-subject"
              placeholder="Enter chat subject"
              value={chatSubject}
              onChange={(e) => setChatSubject(e.target.value)}
              data-testid="input-chat-subject"
            />
          </div>

          {/* Participant Selection */}
          <div className="space-y-2">
            <Label>Select Participants</Label>
            <p className="text-sm text-muted-foreground">
              Choose team members to include in this chat
            </p>
            
            {loadingEmployees ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading employees...
              </div>
            ) : employeesError ? (
              <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-md">
                <p className="text-sm text-destructive font-medium mb-1">
                  Failed to load employees
                </p>
                <p className="text-xs text-muted-foreground">
                  {(employeesError as any)?.message || "Unable to fetch employee list. Please try again."}
                </p>
              </div>
            ) : employees && employees.length > 0 ? (
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {employees.map((emp: any) => (
                  <div
                    key={emp.id}
                    className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                    onClick={() => toggleParticipant(emp.id)}
                    data-testid={`participant-option-${emp.id}`}
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                      selectedParticipants.includes(emp.id)
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground'
                    }`}>
                      {selectedParticipants.includes(emp.id) && (
                        <div className="h-2 w-2 bg-white rounded-sm" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No employees available
              </div>
            )}
            
            {selectedParticipants.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" data-testid="participant-count">
                  {selectedParticipants.length} selected
                </Badge>
              </div>
            )}
          </div>

          {/* Chat Type */}
          <div className="space-y-2">
            <Label>Chat Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {["employee_to_employee", "manager_to_employee", "group", "customer_support"].map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={chatType === type ? "default" : "outline"}
                  onClick={() => setChatType(type)}
                  className="justify-start"
                  data-testid={`button-chat-type-${type}`}
                >
                  {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </Button>
              ))}
            </div>
          </div>

          {/* Guest Invitation Section */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold">Customer/Guest Invitation (Optional)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Invite a customer to view shift updates and documentation
            </p>

            <div className="space-y-3">
              <div>
                <Label htmlFor="guest-name">Guest Name</Label>
                <Input
                  id="guest-name"
                  placeholder="Customer name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  data-testid="input-guest-name"
                />
              </div>
              <div>
                <Label htmlFor="guest-email">Guest Email</Label>
                <Input
                  id="guest-email"
                  type="email"
                  placeholder="customer@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  data-testid="input-guest-email"
                />
              </div>
              <div>
                <Label htmlFor="guest-phone">Guest Phone (Optional)</Label>
                <Input
                  id="guest-phone"
                  placeholder="+1 (555) 000-0000"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  data-testid="input-guest-phone"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-chat">
            Cancel
          </Button>
          <Button
            onClick={handleCreateChat}
            disabled={createChatMutation.isPending}
            data-testid="button-create-chat-submit"
          >
            {createChatMutation.isPending ? "Creating..." : "Create Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Audit Data Dialog Component
function AuditDataDialog({
  shift,
  open,
  onOpenChange,
}: {
  shift: Shift;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: auditData, isLoading } = useQuery({
    queryKey: ["/api/shifts", shift.id, "audit"],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Shift Audit Data</DialogTitle>
          <DialogDescription>
            Complete audit trail for {shift.title || "this shift"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading audit data...</div>
          </div>
        ) : auditData ? (
          <div className="space-y-4">
            {/* Shift Summary */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Shift Information</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Title</Label>
                    <p className="font-medium">{auditData.shift.title || "Untitled"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge>{auditData.shift.status}</Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Start Time</Label>
                    <p className="font-medium">
                      {moment(auditData.shift.startTime).format("MMM DD, YYYY h:mm A")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">End Time</Label>
                    <p className="font-medium">
                      {moment(auditData.shift.endTime).format("MMM DD, YYYY h:mm A")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Employee Info */}
            {auditData.employee && (
              <Card>
                <CardHeader>
                  <h3 className="font-semibold">Employee</h3>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{auditData.employee.name}</p>
                      <p className="text-sm text-muted-foreground">{auditData.employee.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time Tracking Data */}
            {auditData.timeTracking && auditData.timeTracking.length > 0 && (
              <Card>
                <CardHeader>
                  <h3 className="font-semibold">Time Tracking</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  {auditData.timeTracking.map((entry: any, index: number) => (
                    <div key={entry.id} className="border-b pb-4 last:border-0">
                      <div className="grid grid-cols-2 gap-4 mb-2">
                        <div>
                          <Label className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Clock In
                          </Label>
                          <p className="font-medium">
                            {moment(entry.clockIn).format("MMM DD h:mm A")}
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Clock Out
                          </Label>
                          <p className="font-medium">
                            {entry.clockOut
                              ? moment(entry.clockOut).format("MMM DD h:mm A")
                              : "Not clocked out"}
                          </p>
                        </div>
                      </div>

                      {/* GPS Data */}
                      {entry.gps && (entry.gps.clockIn.latitude || entry.gps.clockOut.latitude) && (
                        <div className="mt-2 p-3 bg-muted rounded-md">
                          <Label className="text-muted-foreground flex items-center gap-1 mb-2">
                            <MapPin className="h-3 w-3" />
                            GPS Location
                          </Label>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {entry.gps.clockIn.latitude && (
                              <div>
                                <p className="text-muted-foreground">Clock In</p>
                                <p className="font-mono text-xs">
                                  {entry.gps.clockIn.latitude}, {entry.gps.clockIn.longitude}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Accuracy: {entry.gps.clockIn.accuracy}m
                                </p>
                              </div>
                            )}
                            {entry.gps.clockOut.latitude && (
                              <div>
                                <p className="text-muted-foreground">Clock Out</p>
                                <p className="font-mono text-xs">
                                  {entry.gps.clockOut.latitude}, {entry.gps.clockOut.longitude}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Accuracy: {entry.gps.clockOut.accuracy}m
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Summary Stats */}
            {auditData.summary && (
              <Card>
                <CardHeader>
                  <h3 className="font-semibold">Summary</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Total Hours</Label>
                      <p className="text-2xl font-bold">{auditData.summary.totalHours}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Total Amount</Label>
                      <p className="text-2xl font-bold">${auditData.summary.totalAmount}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Discrepancies</Label>
                      <Badge variant={auditData.summary.totalDiscrepancies > 0 ? "destructive" : "default"}>
                        {auditData.summary.totalDiscrepancies}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Discrepancies */}
            {auditData.discrepancies && auditData.discrepancies.length > 0 && (
              <Card>
                <CardHeader>
                  <h3 className="font-semibold text-destructive">Discrepancies Detected</h3>
                </CardHeader>
                <CardContent className="space-y-2">
                  {auditData.discrepancies.map((disc: any, index: number) => (
                    <div key={index} className="p-3 bg-destructive/10 rounded-md">
                      <p className="font-medium">{disc.discrepancyType}</p>
                      <p className="text-sm text-muted-foreground">{disc.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No audit data available for this shift
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
