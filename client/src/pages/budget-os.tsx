import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Plus, Calendar, Users, Target, BarChart3, PieChart, LineChart,
  FileText, Download, Upload, Settings, Edit, Trash2, Eye,
  ArrowUpRight, ArrowDownRight, Wallet, CreditCard, Building2
} from "lucide-react";
import { MetricsCardsSkeleton, TableSkeleton } from "@/components/loading-indicators/skeletons";

interface Budget {
  id: string;
  name: string;
  department: string;
  period: string;
  totalAmount: number;
  spent: number;
  remaining: number;
  status: "on_track" | "warning" | "over_budget";
  owner: string;
}

interface BudgetLine {
  id: string;
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

export default function BudgetOS() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);

  // Fetch budgets from real API
  const { data: budgets = [], isLoading: budgetsLoading } = useQuery<Budget[]>({
    queryKey: ['/api/budgets'],
    enabled: !authLoading,
  });

  // Fetch budget line items for selected budget
  const { data: budgetLines = [], isLoading: linesLoading } = useQuery<BudgetLine[]>({
    queryKey: ['/api/budgets', selectedBudget, 'line-items'],
    enabled: !!selectedBudget,
  });

  const [newBudget, setNewBudget] = useState({
    name: "",
    department: "",
    totalAmount: 0,
    period: "Q1 2025",
  });

  // Create budget mutation
  const createBudgetMutation = useMutation({
    mutationFn: async (data: typeof newBudget) => {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create budget');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/budgets'] });
      toast({
        title: "Budget created",
        description: "New budget has been created successfully",
      });
      setShowCreateDialog(false);
      setNewBudget({ name: "", department: "", totalAmount: 0, period: "Q1 2025" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create budget",
        variant: "destructive",
      });
    },
  });

  const handleCreateBudget = () => {
    if (!newBudget.name || !newBudget.department || newBudget.totalAmount <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all fields with valid data",
        variant: "destructive",
      });
      return;
    }
    createBudgetMutation.mutate(newBudget);
  };

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalRemaining = budgets.reduce((sum, b) => sum + b.remaining, 0);
  const utilizationRate = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const selectedBudgetData = budgets.find((b) => b.id === selectedBudget);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-teal-600 flex items-center justify-center shadow-lg shadow-primary/30">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">BudgetOS™</h1>
              <p className="text-sm text-muted-foreground">
                Budget Planning & Financial Control
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-budget">
            <Plus className="h-4 w-4 mr-2" />
            New Budget
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      {budgetsLoading ? (
        <MetricsCardsSkeleton count={4} columns={4} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              Total Budgeted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${(totalBudgeted / 1000).toFixed(0)}K</p>
            <p className="text-xs text-muted-foreground">Across all budgets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${(totalSpent / 1000).toFixed(0)}K</p>
            <p className="text-xs text-muted-foreground">{utilizationRate.toFixed(1)}% utilized</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalRemaining < 0 ? "text-red-500" : ""}`}>
              ${Math.abs(totalRemaining / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-muted-foreground">
              {totalRemaining < 0 ? "Over budget" : "Available"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              At Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {budgets.filter((b) => b.status !== "on_track").length}
            </p>
            <p className="text-xs text-muted-foreground">Budgets need attention</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="budgets" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="budgets" data-testid="tab-budgets">
            <FileText className="h-4 w-4 mr-2" />
            Budgets
          </TabsTrigger>
          <TabsTrigger value="forecast" data-testid="tab-forecast">
            <LineChart className="h-4 w-4 mr-2" />
            Forecast
          </TabsTrigger>
          <TabsTrigger value="variance" data-testid="tab-variance">
            <BarChart3 className="h-4 w-4 mr-2" />
            Variance Analysis
          </TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approvals
          </TabsTrigger>
        </TabsList>

        {/* Budgets Tab */}
        <TabsContent value="budgets" className="space-y-4">
          {budgetsLoading ? (
            <TableSkeleton rows={4} columns={3} compact={false} />
          ) : budgets.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No budgets created yet. Click "New Budget" to get started.
              </CardContent>
            </Card>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {budgets.map((budget) => {
              const utilizationPercent = (budget.spent / budget.totalAmount) * 100;
              return (
                <Card
                  key={budget.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedBudget(budget.id)}
                  data-testid={`budget-${budget.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{budget.name}</CardTitle>
                          <Badge
                            variant={
                              budget.status === "on_track"
                                ? "default"
                                : budget.status === "warning"
                                ? "secondary"
                                : "destructive"
                            }
                            className="h-5"
                          >
                            {budget.status === "on_track" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            ) : budget.status === "warning" ? (
                              <AlertTriangle className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {budget.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {budget.department}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {budget.period}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Budgeted</p>
                        <p className="text-sm font-bold">${(budget.totalAmount / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Spent</p>
                        <p className="text-sm font-bold text-orange-500">
                          ${(budget.spent / 1000).toFixed(0)}K
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                        <p
                          className={`text-sm font-bold ${
                            budget.remaining < 0 ? "text-red-500" : "text-blue-500"
                          }`}
                        >
                          ${Math.abs(budget.remaining / 1000).toFixed(0)}K
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Utilization</span>
                        <span className="font-medium">{utilizationPercent.toFixed(1)}%</span>
                      </div>
                      <Progress value={utilizationPercent} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Owner: {budget.owner}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6">
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader>
              <CardTitle>Budget Forecast</CardTitle>
              <CardDescription>Projected spending and trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-16 text-muted-foreground">
                <LineChart className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Forecast Dashboard Coming Soon</p>
                <p className="text-sm">Advanced forecasting with AI-powered predictions</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variance Analysis Tab */}
        <TabsContent value="variance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget vs Actual Variance Analysis</CardTitle>
              <CardDescription>Track budget performance by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {budgetLines.map((line) => (
                  <Card key={line.id} className="hover-elevate" data-testid={`variance-${line.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{line.category}</h4>
                        <Badge
                          variant={line.variance >= 0 ? "default" : "destructive"}
                          className="h-5"
                        >
                          {line.variance >= 0 ? (
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                          )}
                          {line.variancePercent > 0 ? "+" : ""}
                          {line.variancePercent.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Budgeted</p>
                          <p className="font-medium">${line.budgeted.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Actual</p>
                          <p className="font-medium">${line.actual.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Variance</p>
                          <p
                            className={`font-medium ${
                              line.variance >= 0 ? "text-blue-500" : "text-red-500"
                            }`}
                          >
                            ${Math.abs(line.variance).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <CardTitle>Budget Approval Workflow</CardTitle>
              <CardDescription>Review and approve budget requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Approval Queue</p>
                <p className="text-sm">No pending approvals at this time</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Budget Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-budget">
          <DialogHeader>
            <DialogTitle>Create New Budget</DialogTitle>
            <DialogDescription>
              Set up a new budget for your department or project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="budget-name">Budget Name *</Label>
              <Input
                id="budget-name"
                placeholder="e.g., Q2 2025 Marketing Budget"
                value={newBudget.name}
                onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                data-testid="input-budget-name"
              />
            </div>
            <div>
              <Label htmlFor="budget-department">Department *</Label>
              <Select
                value={newBudget.department}
                onValueChange={(value) => setNewBudget({ ...newBudget, department: value })}
              >
                <SelectTrigger id="budget-department" data-testid="select-budget-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="hr">Human Resources</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="budget-amount">Total Amount *</Label>
              <Input
                id="budget-amount"
                type="number"
                placeholder="50000"
                value={newBudget.totalAmount || ""}
                onChange={(e) =>
                  setNewBudget({ ...newBudget, totalAmount: parseFloat(e.target.value) || 0 })
                }
                data-testid="input-budget-amount"
              />
            </div>
            <div>
              <Label htmlFor="budget-period">Period *</Label>
              <Select
                value={newBudget.period}
                onValueChange={(value) => setNewBudget({ ...newBudget, period: value })}
              >
                <SelectTrigger id="budget-period" data-testid="select-budget-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q1 2025">Q1 2025</SelectItem>
                  <SelectItem value="Q2 2025">Q2 2025</SelectItem>
                  <SelectItem value="Q3 2025">Q3 2025</SelectItem>
                  <SelectItem value="Q4 2025">Q4 2025</SelectItem>
                  <SelectItem value="FY 2025">FY 2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBudget}
              disabled={!newBudget.name || !newBudget.department || newBudget.totalAmount <= 0}
              data-testid="button-create-budget-submit"
            >
              Create Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
