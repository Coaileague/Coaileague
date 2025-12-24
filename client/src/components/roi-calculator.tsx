import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { TrendingUp, DollarSign, Clock } from "lucide-react";
import type { PremiumFeature } from "@/data/premiumFeatures";

interface ROICalculatorProps {
  feature: PremiumFeature;
}

export function ROICalculator({ feature }: ROICalculatorProps) {
  const [employees, setEmployees] = useState(50);
  const [avgHourlyRate, setAvgHourlyRate] = useState(50);

  // Calculate ROI based on feature type
  const calculateROI = () => {
    const monthlyCost = feature.price;
    const annualCost = monthlyCost * 12;

    let annualSavings = 0;
    let timesSavedPerWeek = 0;

    if (feature.roi.timesSaved) {
      // Time-based savings (calculated from hours saved)
      timesSavedPerWeek = feature.roi.timesSaved;
      const annualHoursSaved = timesSavedPerWeek * 52;
      annualSavings = annualHoursSaved * avgHourlyRate;
    } else if (feature.roi.costsSaved) {
      // Direct cost savings (already NET of subscription cost in data)
      annualSavings = feature.roi.costsSaved + annualCost; // Add back cost to get gross savings
    } else if (feature.roi.revenueGenerated) {
      // Revenue-based (white-label)
      annualSavings = 50 * employees * 12; // Gross revenue potential
    }

    // Net savings = gross savings - annual cost
    const netAnnualSavings = annualSavings - annualCost;
    const roiPercentage = monthlyCost > 0 ? (netAnnualSavings / annualCost) * 100 : 0;
    const breakEvenMonths = monthlyCost > 0 && netAnnualSavings > 0 
      ? (annualCost / (netAnnualSavings / 12)) 
      : 0;
    const monthlyNetSavings = netAnnualSavings / 12;

    return {
      monthlyCost,
      annualCost,
      annualSavings,
      netAnnualSavings,
      roiPercentage,
      breakEvenMonths,
      monthlyNetSavings,
      timesSavedPerWeek,
    };
  };

  const roi = calculateROI();

  return (
    <div className="space-y-4">
      {/* Input Controls */}
      <Card className="cad-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm cad-text-primary">Customize Calculator</CardTitle>
          <CardDescription className="text-xs">
            Adjust to match your business
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feature.roi.revenueGenerated && (
            <div className="space-y-2">
              <Label htmlFor="employees" className="text-xs cad-text-secondary">
                Number of Employees: {employees}
              </Label>
              <Slider
                id="employees"
                min={10}
                max={500}
                step={10}
                value={[employees]}
                onValueChange={(value) => setEmployees(value[0])}
                className="w-full"
              />
            </div>
          )}
          
          {feature.roi.timesSaved && (
            <div className="space-y-2">
              <Label htmlFor="hourly-rate" className="text-xs cad-text-secondary">
                Average Hourly Rate
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-xs cad-text-tertiary">$</span>
                <Input
                  id="hourly-rate"
                  type="number"
                  value={avgHourlyRate}
                  onChange={(e) => setAvgHourlyRate(Number(e.target.value) || 50)}
                  className="text-sm"
                  data-testid="input-hourly-rate"
                />
                <span className="text-xs cad-text-tertiary">/hour</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ROI Results */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="cad-panel bg-[hsl(var(--cad-green))]/10 border-[hsl(var(--cad-green))]/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--cad-green))]" />
              <CardDescription className="text-xs cad-text-secondary">
                Annual Savings
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--cad-green))]">
              ${roi.annualSavings.toLocaleString()}
            </div>
            <div className="text-xs cad-text-tertiary mt-1">
              ${roi.monthlyNetSavings.toLocaleString()}/month net
            </div>
          </CardContent>
        </Card>

        <Card className="cad-panel bg-[hsl(var(--cad-blue))]/10 border-[hsl(var(--cad-blue))]/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[hsl(var(--cad-blue))]" />
              <CardDescription className="text-xs cad-text-secondary">
                ROI
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--cad-blue))]">
              {Math.round(roi.roiPercentage)}%
            </div>
            <div className="text-xs cad-text-tertiary mt-1">
              {roi.breakEvenMonths < 1 ? '<1' : Math.ceil(roi.breakEvenMonths)} month payback
            </div>
          </CardContent>
        </Card>

        {roi.timesSavedPerWeek > 0 && (
          <Card className="cad-panel bg-[hsl(var(--cad-purple))]/10 border-[hsl(var(--cad-purple))]/20 col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[hsl(var(--cad-purple))]" />
                <CardDescription className="text-xs cad-text-secondary">
                  Time Saved
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[hsl(var(--cad-purple))]">
                {roi.timesSavedPerWeek} hours/week
              </div>
              <div className="text-xs cad-text-tertiary mt-1">
                {roi.timesSavedPerWeek * 52} hours/year = {Math.round((roi.timesSavedPerWeek * 52) / 40)} work weeks
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cost Breakdown */}
      <Card className="cad-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm cad-text-primary">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="cad-text-secondary">Monthly Cost</span>
            <span className="font-mono cad-text-primary">${roi.monthlyCost}/mo</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="cad-text-secondary">Annual Cost</span>
            <span className="font-mono cad-text-primary">${roi.annualCost}/yr</span>
          </div>
          <div className="h-px bg-[hsl(var(--cad-border))]" />
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-[hsl(var(--cad-green))]">Potential Net Annual Savings</span>
            <span className="font-mono text-[hsl(var(--cad-green))]">
              Up to ${roi.netAnnualSavings.toLocaleString()}/yr
            </span>
          </div>
        </CardContent>
      </Card>

      {/* FTC Disclaimer */}
      <p className="text-[10px] cad-text-tertiary text-center mt-2">
        *Savings estimates based on U.S. Bureau of Labor Statistics median wages. Actual results vary by organization size, industry, and implementation.
      </p>
    </div>
  );
}
