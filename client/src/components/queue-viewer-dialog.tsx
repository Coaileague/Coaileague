/**
 * Queue Viewer Dialog
 * Visual popup showing queue with numbers and colors
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Users, TrendingUp, Circle } from "lucide-react";

interface QueueEntry {
  id: string;
  userName: string;
  position: number;
  waitTime: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  userType: 'subscriber' | 'org_user' | 'guest';
}

interface QueueViewerDialogProps {
  open: boolean;
  onClose: () => void;
  queueEntries: QueueEntry[];
}

export function QueueViewerDialog({ open, onClose, queueEntries }: QueueViewerDialogProps) {
  const priorityColors = {
    low: 'bg-slate-500',
    normal: 'bg-blue-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500'
  };

  const userTypeColors = {
    subscriber: 'text-purple-600 dark:text-blue-700 dark:text-blue-400',
    org_user: 'text-blue-600 dark:text-blue-400',
    guest: 'text-slate-600 dark:text-slate-400'
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Support Queue ({queueEntries.length} waiting)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Queue Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="w-4 h-4" />
                In Queue
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {queueEntries.length}
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                Avg Wait
              </div>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {queueEntries.length > 0 
                  ? Math.round(queueEntries.reduce((acc, e) => acc + e.waitTime, 0) / queueEntries.length) 
                  : 0}m
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="w-4 h-4" />
                Priority
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-blue-700 dark:text-blue-400">
                {queueEntries.filter(e => e.priority === 'urgent' || e.priority === 'high').length}
              </div>
            </div>
          </div>

          {/* Queue List */}
          <ScrollArea className="max-h-[50vh] rounded-lg border">
            <div className="p-4 space-y-2">
              {queueEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No one in queue</p>
                </div>
              ) : (
                queueEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate transition-all"
                  >
                    {/* Position Number */}
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center font-bold text-white
                      ${priorityColors[entry.priority]}
                    `}>
                      #{entry.position}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium truncate ${userTypeColors[entry.userType]}`}>
                          {entry.userName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {entry.userType === 'subscriber' ? 'Subscriber' : 
                           entry.userType === 'org_user' ? 'Organization' : 'Guest'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {entry.waitTime} min wait
                        </span>
                        <span className="flex items-center gap-1">
                          <Circle className={`w-2 h-2 fill-current ${
                            entry.priority === 'urgent' ? 'text-red-500' :
                            entry.priority === 'high' ? 'text-orange-500' :
                            entry.priority === 'normal' ? 'text-blue-500' :
                            'text-slate-500'
                          }`} />
                          {entry.priority.charAt(0).toUpperCase() + entry.priority.slice(1)} Priority
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
