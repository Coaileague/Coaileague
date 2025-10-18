import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign, Calendar, CheckCircle2, AlertCircle,
  FileText, Building2, CreditCard, Download
} from "lucide-react";
import { Link } from "wouter";
import type { Invoice, Client } from "@shared/schema";

export default function ClientPortalCompact() {
  const { user } = useAuth();

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const currentClient = clients.find(client => client.email === user?.email);
  const clientInvoices = currentClient
    ? invoices.filter(inv => inv.clientId === currentClient.id)
    : [];

  const totalBilled = clientInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalPaid = clientInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const outstandingBalance = clientInvoices
    .filter(inv => inv.status === 'sent')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  if (!currentClient) {
    return (
      <div className="p-3">
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Client Profile Not Found</h2>
            <p className="text-sm text-muted-foreground">
              You need to be registered as a client to access this portal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 max-w-[1920px] mx-auto">
      {/* COMPACT HEADER */}
      <div className="flex items-center justify-between mb-3 bg-gradient-to-r from-blue-900 to-cyan-900 text-white p-3 rounded-lg">
        <div>
          <h1 className="text-lg font-bold">{currentClient.companyName || 'Client Portal'}</h1>
          <p className="text-xs opacity-75">Invoices · Payments · Reports</p>
        </div>
        
        {/* QUICK ACTIONS */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-pay-invoice">
            <CreditCard className="h-3 w-3 mr-1" />
            Make Payment
          </Button>
          <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-download-statements">
            <Download className="h-3 w-3 mr-1" />
            Statements
          </Button>
        </div>
      </div>

      {/* COMPACT STATS */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { icon: DollarSign, label: "Total Billed", value: `$${totalBilled.toFixed(2)}`, color: "text-blue-600", testid: "stat-billed" },
          { icon: CheckCircle2, label: "Total Paid", value: `$${totalPaid.toFixed(2)}`, color: "text-emerald-600", testid: "stat-paid" },
          { icon: AlertCircle, label: "Outstanding", value: `$${outstandingBalance.toFixed(2)}`, color: "text-amber-600", testid: "stat-outstanding" },
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

      {/* INVOICES TABLE */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-semibold mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              All Invoices
            </span>
            <Badge variant="secondary" className="h-4 text-[10px]">{clientInvoices.length} total</Badge>
          </h3>
          <ScrollArea className="h-[400px]">
            {clientInvoices.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No invoices found</p>
            ) : (
              <div className="space-y-1">
                {clientInvoices.map((invoice) => (
                  <div key={invoice.id} className="p-2 rounded bg-muted/50 hover:bg-muted text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">Invoice #{invoice.invoiceNumber}</span>
                      <Badge 
                        variant={invoice.status === 'paid' ? 'default' : invoice.status === 'sent' ? 'secondary' : 'outline'}
                        className="h-4 text-[10px]"
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : 'N/A'}</span>
                      <span className="font-bold text-foreground">${Number(invoice.total || 0).toFixed(2)}</span>
                    </div>
                    {invoice.dueDate && invoice.status !== 'paid' && (
                      <div className="text-[10px] text-amber-600 mt-1">
                        Due: {new Date(invoice.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
