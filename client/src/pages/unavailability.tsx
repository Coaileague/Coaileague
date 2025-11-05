import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Trash2, CalendarOff } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface UnavailabilityEntry {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: "vacation" | "sick" | "personal" | "other";
}

export default function Unavailability() {
  const [entries, setEntries] = useState<UnavailabilityEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<UnavailabilityEntry["type"]>("vacation");

  const handleSubmit = () => {
    const newEntry: UnavailabilityEntry = {
      id: Date.now().toString(),
      startDate,
      endDate,
      reason,
      type,
    };
    setEntries([...entries, newEntry]);
    setDialogOpen(false);
    setStartDate("");
    setEndDate("");
    setReason("");
    setType("vacation");
  };

  const handleDelete = (id: string) => {
    setEntries(entries.filter(entry => entry.id !== id));
  };

  const getTypeColor = (type: UnavailabilityEntry["type"]) => {
    switch (type) {
      case "vacation": return "bg-blue-500/10 text-blue-500";
      case "sick": return "bg-red-500/10 text-red-500";
      case "personal": return "bg-purple-500/10 text-purple-500";
      default: return "bg-gray-500/10 text-gray-500";
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <PageHeader
        title="Unavailability Calendar"
        description="Manage your time off requests and unavailable dates"
      >
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-unavailability">
                <Plus className="h-4 w-4 mr-2" />
                Add Unavailability
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-add-unavailability">
              <DialogHeader>
                <DialogTitle>Request Time Off</DialogTitle>
                <DialogDescription>
                  Mark dates when you'll be unavailable for scheduling
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="type">Type</Label>
                  <select
                    id="type"
                    className="w-full mt-1 rounded-md border bg-background px-3 py-2"
                    value={type}
                    onChange={(e) => setType(e.target.value as UnavailabilityEntry["type"])}
                    data-testid="select-type"
                  >
                    <option value="vacation">Vacation</option>
                    <option value="sick">Sick Leave</option>
                    <option value="personal">Personal</option>
                    <option value="other">Other</option>
                  </select>
                </div>
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
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button onClick={handleSubmit} data-testid="button-submit">
                  Submit Request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      <div className="mt-6">
        {entries.length === 0 ? (
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
              <Card key={entry.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg">
                          {format(new Date(entry.startDate), "MMM d, yyyy")} - {format(new Date(entry.endDate), "MMM d, yyyy")}
                        </CardTitle>
                        <Badge className={getTypeColor(entry.type)}>
                          {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
                        </Badge>
                      </div>
                      {entry.reason && (
                        <CardDescription>{entry.reason}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(entry.id)}
                      data-testid={`button-delete-${entry.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
