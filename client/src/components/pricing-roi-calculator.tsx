import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PRICING_TIERS, calculateOverage, type SubscriptionTier } from "@/config/pricing";
import { Calculator, TrendingUp, DollarSign, Clock, Shield, Users } from "lucide-react";
import { useLocation } from "wouter";

interface ROIBreakdown {
  adminTimeSaved: number;
  timesheetFraudPrevented: number;
  profitOptimization: number;
  complianceProtection: number;
  totalSavings: number;
}

function calculateROI(employees: number, avgPayRate: number): ROIBreakdown {
  const monthlyPayroll = employees * avgPayRate * 160;
  const adminTimeSaved = 35 * 25;
  const timesheetFraudPrevented = monthlyPayroll * 0.03;
  const profitOptimization = monthlyPayroll * 1.15 * 0.02;
  const complianceProtection = 2000 / 12;
  
  return {
    adminTimeSaved,
    timesheetFraudPrevented: Math.round(timesheetFraudPrevented),
    profitOptimization: Math.round(profitOptimization),
    complianceProtection: Math.round(complianceProtection),
    totalSavings: Math.round(adminTimeSaved + timesheetFraudPrevented + profitOptimization + complianceProtection),
  };
}

function recommendTier(employees: number): SubscriptionTier {
  if (employees <= 20) return 'starter';
  if (employees <= 100) return 'professional';
  return 'enterprise';
}

export function PricingROICalculator() {
  const [, setLocation] = useLocation();
  const [employees, setEmployees] = useState(50);
  const [avgPayRate, setAvgPayRate] = useState(18);
  
  const recommendedTier = recommendTier(employees);
  const tierConfig = PRICING_TIERS[recommendedTier];
  const roi = calculateROI(employees, avgPayRate);
  
  const { overageEmployees, overageCharge } = calculateOverage(recommendedTier, employees);
  const basePrice = tierConfig.monthlyPrice ?? 3500;
  const totalCost = basePrice + overageCharge;
  const netSavings = roi.totalSavings - totalCost;
  const roiPercent = totalCost > 0 ? Math.round((netSavings / totalCost) * 100) : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-blue-50/50 to-background dark:from-blue-950/20">
      <CardHeader className="text-center pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Calculator className="h-4 w-4 sm:h-6 sm:w-6 text-primary shrink-0" />
          <CardTitle className="text-base sm:text-xl">Calculate Your ROI</CardTitle>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">See how much Trinity AI can save your business</p>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6 px-3 sm:px-6">
        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">Number of Employees</span>
              </Label>
              <Badge variant="secondary" className="text-sm sm:text-lg font-bold whitespace-nowrap shrink-0">{employees}</Badge>
            </div>
            <Slider
              value={[employees]}
              onValueChange={([v]) => setEmployees(v)}
              min={5}
              max={200}
              step={5}
              className="w-full"
              data-testid="slider-employees"
            />
            <div className="flex justify-between gap-1 text-[10px] sm:text-xs text-muted-foreground">
              <span>5</span>
              <span>200+</span>
            </div>
          </div>

          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0">
                <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">Avg. Hourly Pay Rate</span>
              </Label>
              <Badge variant="secondary" className="text-sm sm:text-lg font-bold whitespace-nowrap shrink-0">${avgPayRate}/hr</Badge>
            </div>
            <Slider
              value={[avgPayRate]}
              onValueChange={([v]) => setAvgPayRate(v)}
              min={12}
              max={35}
              step={1}
              className="w-full"
              data-testid="slider-payrate"
            />
            <div className="flex justify-between gap-1 text-[10px] sm:text-xs text-muted-foreground">
              <span>$12/hr</span>
              <span>$35/hr</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 sm:pt-4 space-y-2 sm:space-y-3">
          <h4 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 shrink-0" />
            Monthly Savings:
          </h4>
          
          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between gap-2 sm:gap-3 items-center p-1.5 sm:p-2 bg-muted/50 rounded">
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500 shrink-0" />
                <span className="truncate">Admin time saved</span>
              </span>
              <span className="font-semibold text-green-600 whitespace-nowrap shrink-0">{formatCurrency(roi.adminTimeSaved)}</span>
            </div>
            <div className="flex justify-between gap-2 sm:gap-3 items-center p-1.5 sm:p-2 bg-muted/50 rounded">
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4 text-red-500 shrink-0" />
                <span className="truncate">Fraud prevented</span>
              </span>
              <span className="font-semibold text-green-600 whitespace-nowrap shrink-0">{formatCurrency(roi.timesheetFraudPrevented)}</span>
            </div>
            <div className="flex justify-between gap-2 sm:gap-3 items-center p-1.5 sm:p-2 bg-muted/50 rounded">
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-purple-500 shrink-0" />
                <span className="truncate">Profit optimization</span>
              </span>
              <span className="font-semibold text-green-600 whitespace-nowrap shrink-0">{formatCurrency(roi.profitOptimization)}</span>
            </div>
            <div className="flex justify-between gap-2 sm:gap-3 items-center p-1.5 sm:p-2 bg-muted/50 rounded">
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4 text-orange-500 shrink-0" />
                <span className="truncate">Compliance protection</span>
              </span>
              <span className="font-semibold text-green-600 whitespace-nowrap shrink-0">{formatCurrency(roi.complianceProtection)}</span>
            </div>
          </div>

          <div className="border-t pt-2 sm:pt-3">
            <div className="flex justify-between gap-2 sm:gap-3 items-center text-sm sm:text-lg font-bold">
              <span className="truncate">Total Monthly Savings</span>
              <span className="text-green-600 whitespace-nowrap shrink-0">{formatCurrency(roi.totalSavings)}</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 sm:pt-4 space-y-2 sm:space-y-3">
          <div className="p-2 sm:p-3 bg-primary/5 rounded-lg">
            <div className="flex justify-between gap-2 items-center mb-1 sm:mb-2 flex-wrap">
              <span className="font-medium text-xs sm:text-sm whitespace-nowrap">
                Recommended: {tierConfig.displayName}
              </span>
              <Badge className="bg-primary whitespace-nowrap text-[10px] sm:text-xs">{formatCurrency(basePrice)}/mo</Badge>
            </div>
            {overageEmployees > 0 && (
              <div className="text-[10px] sm:text-sm text-muted-foreground">
                + {overageEmployees} employees x ${tierConfig.overagePrice} = {formatCurrency(overageCharge)}/mo
              </div>
            )}
            <div className="text-xs sm:text-sm font-medium mt-1">
              Total: {formatCurrency(totalCost)}/month
            </div>
          </div>

          <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-950/30 rounded-lg text-center overflow-hidden">
            <div className="text-xl sm:text-3xl font-bold text-green-600 whitespace-nowrap truncate">{formatCurrency(netSavings)}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">Net Monthly Profit</div>
            <div className="mt-1.5 sm:mt-2 flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 whitespace-nowrap text-[10px] sm:text-xs">
                {roiPercent}% ROI
              </Badge>
              <span className="text-[10px] sm:text-sm text-muted-foreground whitespace-nowrap">
                {formatCurrency(netSavings * 12)}/year
              </span>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            These figures are illustrative estimates based on your inputs. Actual savings vary by organization size, workflows, and implementation. Not a guarantee of results.
          </p>
          <Button 
            className="w-full text-xs sm:text-sm" 
            onClick={() => setLocation(`/register?tier=${recommendedTier}`)}
            data-testid="button-start-trial"
          >
            Start Free Trial
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
