import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, Clock, TrendingUp } from "lucide-react";

/**
 * Dashboard Preview Component
 * Shows real WorkforceOS Dashboard interface with actual metrics layout
 */
export function DashboardPreview() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 rounded-lg overflow-hidden border shadow-xl p-4">
      {/* Dashboard Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white mb-1">Workforce Dashboard</h2>
        <p className="text-sm text-slate-300">Real-time metrics</p>
      </div>

      {/* Metric Cards - Actual WorkforceOS design */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="bg-gradient-to-br from-indigo-500/10 to-blue-500/5 border-indigo-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <Users className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-xs text-slate-300">Total Employees</div>
          <div className="text-2xl font-bold text-white">142</div>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-green-500/5 border-primary/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xs text-slate-300">Revenue</div>
          <div className="text-2xl font-bold text-white">$287K</div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/5 border-purple-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-xs text-slate-300">Active Today</div>
          <div className="text-2xl font-bold text-white">98</div>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-xs text-slate-300">Growth</div>
          <div className="text-2xl font-bold text-white">+18%</div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button className="px-3 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-md text-xs font-medium text-primary transition-colors">
          View Reports
        </button>
        <button className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-xs font-medium text-white transition-colors">
          Manage Team
        </button>
      </div>
    </div>
  );
}
