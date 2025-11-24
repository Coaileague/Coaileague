import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface EscalationLevel {
  level: number;
  name: string;
  responseTimeMinutes: number;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface EscalationMatrixDisplayProps {
  workspaceId?: string;
}

export function EscalationMatrixDisplay({ workspaceId }: EscalationMatrixDisplayProps) {
  const { data: matrix, isLoading } = useQuery({
    queryKey: ['/api/escalation/matrix'],
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Escalation Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const levels: EscalationLevel[] = matrix?.data || [
    { level: 1, name: 'Initial Support', responseTimeMinutes: 15, assignedTo: 'Support Team', priority: 'low' },
    { level: 2, name: 'Escalated', responseTimeMinutes: 30, assignedTo: 'Senior Support', priority: 'medium' },
    { level: 3, name: 'Management', responseTimeMinutes: 60, assignedTo: 'Manager', priority: 'high' },
    { level: 4, name: 'Executive', responseTimeMinutes: 120, assignedTo: 'Director', priority: 'critical' },
  ];

  const priorityColors = {
    low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Escalation Matrix
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {levels.map((level) => (
            <div
              key={level.level}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover-elevate transition-all"
              data-testid={`escalation-level-${level.level}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-bold text-gray-400">L{level.level}</span>
                    <h3 className="font-semibold">{level.name}</h3>
                    <Badge className={priorityColors[level.priority]}>
                      {level.priority.charAt(0).toUpperCase() + level.priority.slice(1)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{level.responseTimeMinutes}m Response</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>{level.assignedTo}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
