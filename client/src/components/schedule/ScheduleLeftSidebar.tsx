import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScheduleFilters, type ScheduleFilterState } from './ScheduleFilters';
import type { Shift, Employee, Client } from '@shared/schema';

interface ScheduleLeftSidebarProps {
  filters: ScheduleFilterState;
  onFiltersChange: (filters: ScheduleFilterState) => void;
  employees: Employee[];
  clients: Client[];
  filteredEmployees: Employee[];
  filteredShifts: Shift[];
  laborCost: number;
}

export function ScheduleLeftSidebar({
  filters,
  onFiltersChange,
  employees,
  clients,
  filteredEmployees,
  filteredShifts,
  laborCost,
}: ScheduleLeftSidebarProps) {
  const openShiftsCount = filteredShifts.filter(s => !s.employeeId).length;
  const coveredShiftsCount = filteredShifts.filter(s => s.employeeId).length;
  const coveragePercent = filteredShifts.length > 0 
    ? Math.round((coveredShiftsCount / filteredShifts.length) * 100)
    : 100;

  return (
    <div className="w-64 bg-card border-r flex flex-col shrink-0 h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 border-b">
          <ScheduleFilters
            filters={filters}
            onFiltersChange={onFiltersChange}
            employees={employees}
            clients={clients}
          />
        </div>

        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Staff ({filteredEmployees.length})
            </h3>
            <Badge variant="outline" className="text-xs">
              {openShiftsCount} open
            </Badge>
          </div>
        </div>

        <div className="p-3 space-y-4">
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This Week</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-muted/30 border">
                <div className="text-2xl font-bold">{filteredShifts.length}</div>
                <div className="text-xs text-muted-foreground">Total Shifts</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border">
                <div className="text-2xl font-bold text-orange-500">
                  {openShiftsCount}
                </div>
                <div className="text-xs text-muted-foreground">Open Shifts</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Labor</h4>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <div className="text-2xl font-bold">${laborCost.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Estimated Cost</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs text-muted-foreground">Coverage</span>
                <span className="text-sm font-bold">{coveragePercent}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={coveragePercent} aria-valuemin={0} aria-valuemax={100} aria-label="Schedule coverage percentage">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Staff</h4>
            <div className="text-sm text-muted-foreground">
              {filteredEmployees.length} employees shown in schedule
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
