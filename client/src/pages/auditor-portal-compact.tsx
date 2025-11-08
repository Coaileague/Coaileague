import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign, FileText, Users, TrendingUp,
  Download, Calendar, Shield
} from "lucide-react";
import type { Invoice, TimeEntry, Employee } from "@shared/schema";

export default function AuditorPortalCompact() {
  const { user } = useAuth();

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const totalRevenue = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const totalHours = timeEntries
    .filter(entry => entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.totalHours || 0), 0);

  const totalPayroll = timeEntries
    .filter(entry => entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);

  return (
    <div className="p-3 max-w-[1920px] mx-auto">
      {/* COMPACT HEADER */}
      <div className="flex items-center justify-between mb-3 bg-gradient-to-r from-slate-900 to-stone-900 text-white p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <div>
            <h1 className="text-lg font-bold">Auditor Portal</h1>
            <p className="text-xs opacity-75">Read-only financial oversight</p>
          </div>
        </div>
        
        {/* QUICK ACTIONS */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-export-report">
            <Download className="h-3 w-3 mr-1" />
            Export Report
          </Button>
          <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-compliance-check">
            <Shield className="h-3 w-3 mr-1" />
            Compliance
          </Button>
        </div>
      </div>

      {/* COMPACT STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {[
          { icon: DollarSign, label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}`, color: "text-primary", testid: "stat-revenue" },
          { icon: FileText, label: "Total Invoices", value: invoices.length, color: "text-blue-600", testid: "stat-invoices" },
          { icon: Users, label: "Total Employees", value: employees.length, color: "text-violet-600", testid: "stat-employees" },
          { icon: TrendingUp, label: "Total Hours", value: `${totalHours.toFixed(1)}h`, color: "text-cyan-600", testid: "stat-hours" },
        ].map((stat, i) => (
          <Card key={i} className="hover-elevate">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground truncate">{stat.label}</div>
                  <div className="text-base font-bold" data-testid={stat.testid}>{stat.value}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CONTENT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Recent Invoices */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Recent Invoices
              </span>
              <Badge variant="secondary" className="h-4 text-[10px]">{invoices.length} total</Badge>
            </h3>
            <ScrollArea className="h-[300px]">
              {invoices.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No invoices found</p>
              ) : (
                <div className="space-y-1">
                  {invoices.slice(0, 20).map((invoice) => (
                    <div key={invoice.id} className="p-2 rounded bg-muted/50 hover:bg-muted text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">#{invoice.invoiceNumber}</span>
                        <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'} className="h-4 text-[10px]">
                          {invoice.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : 'N/A'}</span>
                        <span className="font-bold text-foreground">${Number(invoice.total || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Payroll Summary */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Payroll Overview
              </span>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" data-testid="button-view-details">Details</Button>
            </h3>
            <div className="space-y-2">
              <div className="p-2 rounded bg-muted/50 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Total Payroll</span>
                  <span className="font-bold">${totalPayroll.toFixed(2)}</span>
                </div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Total Hours Logged</span>
                  <span className="font-bold">{totalHours.toFixed(1)}h</span>
                </div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Active Employees</span>
                  <span className="font-bold">{employees.length}</span>
                </div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Avg Hourly Rate</span>
                  <span className="font-bold">${totalHours > 0 ? (totalPayroll / totalHours).toFixed(2) : '0.00'}/h</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
