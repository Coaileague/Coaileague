import { DollarSign, Clock, UserCheck, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Shift, Employee } from '@shared/schema';

interface ReportsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: Shift[];
  employees: Employee[];
}

export function ReportsSheet({ open, onOpenChange, shifts, employees }: ReportsSheetProps) {
  const getEmployee = (id: string) => employees.find(e => e.id === id);

  const getShiftDuration = (shift: Shift) => {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  };

  const calculateLaborCost = () => {
    let total = 0;
    shifts.forEach(shift => {
      const emp = shift.employeeId ? getEmployee(shift.employeeId) : null;
      if (emp && emp.hourlyRate) {
        total += parseFloat(emp.hourlyRate) * getShiftDuration(shift);
      }
    });
    return total;
  };

  const calculateTotalHours = () => {
    return shifts.reduce((acc, shift) => acc + getShiftDuration(shift), 0);
  };

  const laborCost = calculateLaborCost();
  const totalHours = calculateTotalHours();
  const presentEmployees = employees.filter(e => e.isActive).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh]">
        <SheetHeader>
          <SheetTitle>Schedule Reports</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Labor Costs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-bold" data-testid="text-labor-total">
                  ${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-muted-foreground">Overtime</span>
                <span className="text-sm font-medium">$0.00</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Hours</span>
                <span className="text-2xl font-bold" data-testid="text-hours-total">
                  {totalHours.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-muted-foreground">Scheduled Shifts</span>
                <span className="text-sm font-medium">{shifts.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-purple-600" />
                Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active Employees</span>
                <span className="text-2xl font-bold" data-testid="text-employees-active">
                  {presentEmployees}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-muted-foreground">Late</span>
                <span className="text-sm font-medium">0</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
