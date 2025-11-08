import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign, Calendar, CheckCircle2, AlertCircle,
  FileText, Building2, CreditCard, Download, Eye
} from "lucide-react";
import { Link } from "wouter";
import type { Invoice, Client, InvoiceLineItem } from "@shared/schema";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default function ClientPortalCompact() {
  const { user } = useAuth();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

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

  // Fetch line items only for the selected invoice (secure per-invoice fetch)
  const { data: selectedInvoiceLineItems = [] } = useQuery<InvoiceLineItem[]>({
    queryKey: ["/api/invoices", selectedInvoice?.id, "line-items"],
    enabled: !!selectedInvoice?.id,
  });

  const totalBilled = clientInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalPaid = clientInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const outstandingBalance = clientInvoices
    .filter(inv => inv.status === 'sent')
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  const handleViewDetails = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailDialogOpen(true);
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // Letter size
      
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      const { width, height } = page.getSize();
      let yPosition = height - 50;

      // Header - WorkforceOS Branding
      page.drawText('WorkforceOS™', {
        x: 50,
        y: yPosition,
        size: 24,
        font: boldFont,
        color: rgb(0.05, 0.59, 0.53), // Teal branding
      });
      yPosition -= 30;

      page.drawText('INVOICE', {
        x: 50,
        y: yPosition,
        size: 18,
        font: boldFont,
      });
      yPosition -= 40;

      // Invoice details
      page.drawText(`Invoice #: ${invoice.invoiceNumber}`, {
        x: 50,
        y: yPosition,
        size: 12,
        font: font,
      });
      yPosition -= 20;

      page.drawText(`Issue Date: ${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : 'N/A'}`, {
        x: 50,
        y: yPosition,
        size: 12,
        font: font,
      });
      yPosition -= 20;

      if (invoice.dueDate) {
        page.drawText(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, {
          x: 50,
          y: yPosition,
          size: 12,
          font: font,
        });
        yPosition -= 20;
      }

      page.drawText(`Status: ${invoice.status?.toUpperCase() || 'PENDING'}`, {
        x: 50,
        y: yPosition,
        size: 12,
        font: font,
      });
      yPosition -= 40;

      // Bill To section
      page.drawText('BILL TO:', {
        x: 50,
        y: yPosition,
        size: 12,
        font: boldFont,
      });
      yPosition -= 20;

      if (currentClient) {
        page.drawText(`${currentClient.firstName} ${currentClient.lastName}`, {
          x: 50,
          y: yPosition,
          size: 11,
          font: font,
        });
        yPosition -= 18;

        if (currentClient.companyName) {
          page.drawText(currentClient.companyName, {
            x: 50,
            y: yPosition,
            size: 11,
            font: font,
          });
          yPosition -= 18;
        }

        if (currentClient.address) {
          page.drawText(currentClient.address, {
            x: 50,
            y: yPosition,
            size: 11,
            font: font,
          });
          yPosition -= 18;
        }

        page.drawText(currentClient.email || '', {
          x: 50,
          y: yPosition,
          size: 11,
          font: font,
        });
        yPosition -= 40;
      }

      // Line items header
      page.drawText('DESCRIPTION', {
        x: 50,
        y: yPosition,
        size: 11,
        font: boldFont,
      });
      page.drawText('AMOUNT', {
        x: width - 150,
        y: yPosition,
        size: 11,
        font: boldFont,
      });
      yPosition -= 5;

      // Divider line
      page.drawLine({
        start: { x: 50, y: yPosition },
        end: { x: width - 50, y: yPosition },
        thickness: 1,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPosition -= 20;

      // Get line items for this invoice (fetch on-demand for PDF generation)
      let invoiceLineItems: InvoiceLineItem[] = [];
      try {
        const response = await fetch(`/api/invoices/${invoice.id}/line-items`, {
          credentials: 'include'
        });
        if (response.ok) {
          invoiceLineItems = await response.json();
        }
      } catch (error) {
        console.error('Error fetching line items for PDF:', error);
      }

      if (invoiceLineItems.length > 0) {
        for (const item of invoiceLineItems) {
          const description = item.description || 'Service';
          page.drawText(description.substring(0, 60), {
            x: 50,
            y: yPosition,
            size: 10,
            font: font,
          });
          page.drawText(`$${Number(item.amount || 0).toFixed(2)}`, {
            x: width - 150,
            y: yPosition,
            size: 10,
            font: font,
          });
          yPosition -= 18;
        }
      } else {
        // Fallback if no line items
        page.drawText('Professional Services', {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
        });
        page.drawText(`$${Number(invoice.subtotal || invoice.total || 0).toFixed(2)}`, {
          x: width - 150,
          y: yPosition,
          size: 10,
          font: font,
        });
        yPosition -= 18;
      }

      yPosition -= 20;

      // Totals section
      page.drawLine({
        start: { x: width - 200, y: yPosition },
        end: { x: width - 50, y: yPosition },
        thickness: 1,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPosition -= 20;

      page.drawText('Subtotal:', {
        x: width - 200,
        y: yPosition,
        size: 11,
        font: font,
      });
      page.drawText(`$${Number(invoice.subtotal || 0).toFixed(2)}`, {
        x: width - 150,
        y: yPosition,
        size: 11,
        font: font,
      });
      yPosition -= 18;

      if (invoice.taxAmount && Number(invoice.taxAmount) > 0) {
        page.drawText(`Tax (${Number(invoice.taxRate || 0).toFixed(1)}%):`, {
          x: width - 200,
          y: yPosition,
          size: 11,
          font: font,
        });
        page.drawText(`$${Number(invoice.taxAmount).toFixed(2)}`, {
          x: width - 150,
          y: yPosition,
          size: 11,
          font: font,
        });
        yPosition -= 18;
      }

      page.drawLine({
        start: { x: width - 200, y: yPosition },
        end: { x: width - 50, y: yPosition },
        thickness: 2,
        color: rgb(0, 0, 0),
      });
      yPosition -= 20;

      page.drawText('TOTAL:', {
        x: width - 200,
        y: yPosition,
        size: 12,
        font: boldFont,
      });
      page.drawText(`$${Number(invoice.total || 0).toFixed(2)}`, {
        x: width - 150,
        y: yPosition,
        size: 12,
        font: boldFont,
      });

      // Footer
      yPosition = 100;
      page.drawText('Thank you for your business!', {
        x: 50,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0.4, 0.4, 0.4),
      });
      yPosition -= 15;
      page.drawText('Generated by WorkforceOS™ BillOS', {
        x: 50,
        y: yPosition,
        size: 9,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Serialize the PDFDocument to bytes
      const pdfBytes = await pdfDoc.save();

      // Create blob and download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice-${invoice.invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

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

  const lineItemsForInvoice = selectedInvoiceLineItems;

  return (
    <div className="p-3 max-w-[1920px] mx-auto">
      {/* COMPACT HEADER */}
      <div className="flex items-center justify-between mb-3 bg-gradient-to-r from-blue-900 to-cyan-900 text-white p-3 rounded-lg">
        <div>
          <h1 className="text-lg font-bold" data-testid="text-portal-title">
            {currentClient.companyName || `${currentClient.firstName} ${currentClient.lastName}'s Portal`}
          </h1>
          <p className="text-xs opacity-75">Invoices · Payments · Reports</p>
        </div>
        
        {/* QUICK ACTIONS */}
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" 
            data-testid="button-pay-invoice"
            disabled
          >
            <CreditCard className="h-3 w-3 mr-1" />
            Make Payment
          </Button>
        </div>
      </div>

      {/* COMPACT STATS */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { icon: DollarSign, label: "Total Billed", value: `$${totalBilled.toFixed(2)}`, color: "text-blue-600", testid: "stat-billed" },
          { icon: CheckCircle2, label: "Total Paid", value: `$${totalPaid.toFixed(2)}`, color: "text-primary", testid: "stat-paid" },
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
              <p className="text-xs text-muted-foreground text-center py-8" data-testid="text-no-invoices">
                No invoices found
              </p>
            ) : (
              <div className="space-y-1">
                {clientInvoices.map((invoice) => (
                  <div 
                    key={invoice.id} 
                    className="p-2 rounded bg-muted/50 hover:bg-muted text-xs"
                    data-testid={`invoice-item-${invoice.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">Invoice #{invoice.invoiceNumber}</span>
                      <Badge 
                        variant={invoice.status === 'paid' ? 'default' : invoice.status === 'sent' ? 'secondary' : 'outline'}
                        className="h-4 text-[10px]"
                        data-testid={`invoice-status-${invoice.id}`}
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                      <span>{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : 'N/A'}</span>
                      <span className="font-bold text-foreground" data-testid={`invoice-total-${invoice.id}`}>
                        ${Number(invoice.total || 0).toFixed(2)}
                      </span>
                    </div>
                    {invoice.dueDate && invoice.status !== 'paid' && (
                      <div className="text-[10px] text-amber-600 mb-2">
                        Due: {new Date(invoice.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-6 text-[10px] flex-1"
                        onClick={() => handleViewDetails(invoice)}
                        data-testid={`button-view-invoice-${invoice.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-6 text-[10px] flex-1"
                        onClick={() => handleDownloadPDF(invoice)}
                        data-testid={`button-download-invoice-${invoice.id}`}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* INVOICE DETAIL DIALOG */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              {/* Invoice Header */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Number</p>
                  <p className="font-semibold" data-testid="detail-invoice-number">
                    {selectedInvoice.invoiceNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge 
                    variant={selectedInvoice.status === 'paid' ? 'default' : selectedInvoice.status === 'sent' ? 'secondary' : 'outline'}
                  >
                    {selectedInvoice.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Issue Date</p>
                  <p className="font-semibold">
                    {selectedInvoice.issueDate ? new Date(selectedInvoice.issueDate).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-semibold">
                    {selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h4 className="font-semibold mb-2">Line Items</h4>
                {lineItemsForInvoice.length > 0 ? (
                  <div className="space-y-2">
                    {lineItemsForInvoice.map((item, index) => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-3 bg-muted rounded"
                        data-testid={`line-item-${index}`}
                      >
                        <div className="flex-1">
                          <p className="font-medium">{item.description || 'Service'}</p>
                          {item.quantity && (
                            <p className="text-xs text-muted-foreground">
                              Qty: {item.quantity}
                              {item.unitPrice && ` × $${Number(item.unitPrice).toFixed(2)}`}
                            </p>
                          )}
                        </div>
                        <p className="font-semibold">${Number(item.amount || 0).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4 bg-muted rounded">
                    No detailed line items available
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span data-testid="detail-subtotal">
                    ${Number(selectedInvoice.subtotal || 0).toFixed(2)}
                  </span>
                </div>
                {selectedInvoice.taxAmount && Number(selectedInvoice.taxAmount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Tax ({Number(selectedInvoice.taxRate || 0).toFixed(1)}%)
                    </span>
                    <span data-testid="detail-tax">
                      ${Number(selectedInvoice.taxAmount).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span data-testid="detail-total">
                    ${Number(selectedInvoice.total || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => handleDownloadPDF(selectedInvoice)}
                  data-testid="button-download-pdf-detail"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setIsDetailDialogOpen(false)}
                  data-testid="button-close-detail"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
