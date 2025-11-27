import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { CheckCircle2, AlertCircle, FileText, CreditCard, Clock, Building2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface InvoicePaymentStatus {
  invoiceId: string;
  invoiceNumber: string;
  total: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  paidAt: string | null;
  payments: Array<{
    id: string;
    amount: string;
    status: string;
    paymentMethod?: string;
    last4?: string;
    paidAt?: string;
    receiptUrl?: string;
  }>;
}

// Simplified PaymentForm - only handles confirmPayment
function PaymentForm({ 
  invoiceId,
  invoice,
  payerName,
  payerEmail,
  onSuccess,
  onError,
}: { 
  invoiceId: string;
  invoice: InvoicePaymentStatus;
  payerName: string;
  payerEmail: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      onError('Payment system not ready. Please try again.');
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/pay-invoice/${invoiceId}`,
          payment_method_data: {
            billing_details: {
              name: payerName,
              email: payerEmail,
            },
          },
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Payment failed');
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Invalidate queries to refresh payment status
        await queryClient.invalidateQueries({ 
          queryKey: ['/api/invoices', invoiceId, 'payment-status'] 
        });
        onSuccess();
      }
    } catch (err: any) {
      onError(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card data-testid="card-payment-details">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Complete Payment
          </CardTitle>
          <CardDescription>
            Securely pay ${invoice.total} for Invoice #{invoice.invoiceNumber}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/30">
            <PaymentElement />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            data-testid="button-complete-payment"
            type="submit"
            disabled={!stripe || !elements || isProcessing}
            className="w-full"
            size="lg"
          >
            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isProcessing ? "Processing..." : `Pay $${invoice.total}`}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export default function PayInvoice() {
  const [, params] = useRoute("/pay-invoice/:id");
  const invoiceId = params?.id || "";
  const { toast } = useToast();
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [stripeConfigError, setStripeConfigError] = useState<string | null>(null);
  
  // Payment flow state
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [localPaymentStatus, setLocalPaymentStatus] = useState<'idle' | 'succeeded' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Stripe configuration from backend
  const { data: stripeConfig, isLoading: isLoadingStripeConfig } = useQuery({
    queryKey: ['/api/stripe/config'],
    queryFn: async () => {
      const response = await fetch('/api/stripe/config');
      if (!response.ok) {
        throw new Error('Failed to load Stripe configuration');
      }
      return response.json() as Promise<{ publishableKey: string | null; isConfigured: boolean }>;
    },
    retry: 3,
  });

  // Initialize Stripe once config is loaded
  useEffect(() => {
    if (stripeConfig) {
      if (!stripeConfig.publishableKey) {
        setStripeConfigError('Stripe is not configured. Please contact support.');
        return;
      }
      setStripePromise(loadStripe(stripeConfig.publishableKey));
    }
  }, [stripeConfig]);

  // Fetch invoice payment status
  const { data: invoiceData, isLoading: isLoadingInvoice, refetch } = useQuery<InvoicePaymentStatus>({
    queryKey: ['/api/invoices', invoiceId, 'payment-status'],
    queryFn: async () => {
      const response = await fetch(`/api/invoices/${invoiceId}/payment-status`);
      if (!response.ok) {
        throw new Error('Invoice not found');
      }
      return response.json();
    },
    enabled: !!invoiceId,
    refetchInterval: (query) => {
      // Stop refetching if paid
      return query.state.data?.status === 'paid' ? false : 10000; // 10 seconds
    },
  });

  // Create payment intent mutation
  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      // Check if invoice is still unpaid
      if (invoiceData?.status === 'paid') {
        throw new Error('Invoice is already paid');
      }

      const response = await fetch(`/api/invoices/${invoiceId}/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payerName,
          payerEmail,
          returnUrl: `${window.location.origin}/pay-invoice/${invoiceId}`,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create payment');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      toast({
        title: "Payment Ready",
        description: "Please enter your card details to complete payment",
      });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePaymentSuccess = () => {
    setLocalPaymentStatus('succeeded');
    toast({
      title: "Payment Successful!",
      description: `Payment of $${invoiceData?.total} completed successfully`,
    });
    refetch();
  };

  const handlePaymentError = (message: string) => {
    setLocalPaymentStatus('failed');
    setErrorMessage(message);
    toast({
      title: "Payment Failed",
      description: message,
      variant: "destructive",
    });
  };

  if (isLoadingStripeConfig || isLoadingInvoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stripeConfigError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Configuration Error
            </CardTitle>
            <CardDescription>{stripeConfigError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!invoiceData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Invoice Not Found
            </CardTitle>
            <CardDescription>
              The invoice you're looking for doesn't exist or the link is invalid.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isPaid = invoiceData.status === 'paid';
  const isOverdue = invoiceData.status === 'overdue';

  return (
    <div className="min-h-screen bg-background py-8 px-4" data-testid="page-pay-invoice">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* CoAIleague Branding */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">CoAIleague</h1>
          <p className="text-sm text-gray-700 dark:text-gray-400">Autonomous Workforce Management Solutions</p>
        </div>

        {/* Invoice Details Card */}
        <Card data-testid="card-invoice-details">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FileText className="h-6 w-6" />
                  Invoice #{invoiceData.invoiceNumber}
                </CardTitle>
                <CardDescription>Invoice Payment Portal</CardDescription>
              </div>
              <Badge 
                variant={isPaid ? "default" : isOverdue ? "destructive" : "secondary"}
                data-testid={`badge-status-${invoiceData.status}`}
                className="text-sm"
              >
                {isPaid && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {isOverdue && <Clock className="h-3 w-3 mr-1" />}
                {invoiceData.status.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Invoice Summary */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Amount Due</p>
                <p className="text-3xl font-bold" data-testid="text-invoice-total">${invoiceData.total}</p>
              </div>
              {invoiceData.paidAt && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Paid On</p>
                  <p className="text-lg font-medium" data-testid="text-paid-date">
                    {new Date(invoiceData.paidAt).toLocaleDateString('en-US', {
                      dateStyle: 'medium'
                    })}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Payment History */}
            {invoiceData.payments.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Payment History</h3>
                <div className="space-y-2">
                  {invoiceData.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      data-testid={`payment-${payment.id}`}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">${payment.amount}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.paymentMethod && payment.last4 ? 
                            `${payment.paymentMethod} •••• ${payment.last4}` : 
                            'Payment method not available'
                          }
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge 
                          variant={payment.status === 'succeeded' ? 'default' : 'secondary'}
                          data-testid={`badge-payment-status-${payment.status}`}
                        >
                          {payment.status}
                        </Badge>
                        {payment.paidAt && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(payment.paidAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Flow (only shown if not paid) */}
        {!isPaid && (
          <>
            {/* Success Message */}
            {localPaymentStatus === 'succeeded' ? (
              <Alert className="border-green-200 bg-muted/30 dark:bg-green-950 dark:border-green-800" data-testid="alert-payment-success">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <AlertTitle className="text-green-900 dark:text-green-100">Payment Successful!</AlertTitle>
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Your payment of ${invoiceData.total} has been processed successfully. You will receive a confirmation email shortly.
                </AlertDescription>
              </Alert>
            ) : !clientSecret ? (
              /* Step 1: Collect payer information */
              <Card data-testid="card-payment-form">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Information
                  </CardTitle>
                  <CardDescription>Enter your information to proceed with payment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="payer-name">Full Name</Label>
                    <Input
                      id="payer-name"
                      data-testid="input-payer-name"
                      placeholder="John Doe"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payer-email">Email Address</Label>
                    <Input
                      id="payer-email"
                      data-testid="input-payer-email"
                      type="email"
                      placeholder="john@example.com"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                      required
                    />
                  </div>
                  {errorMessage && (
                    <Alert variant="destructive" data-testid="alert-setup-error">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    data-testid="button-initialize-payment"
                    onClick={() => createPaymentMutation.mutate()}
                    disabled={!payerName || !payerEmail || createPaymentMutation.isPending}
                    className="w-full"
                  >
                    {createPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {createPaymentMutation.isPending ? "Setting up..." : "Continue to Payment"}
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              /* Step 2: Stripe payment form (only rendered after clientSecret exists) */
              stripePromise && (
                <>
                  <Elements 
                    stripe={stripePromise} 
                    options={{
                      clientSecret,
                      appearance: {
                        theme: 'stripe',
                        variables: {
                          colorPrimary: '#dc2626',
                        },
                      },
                    }}
                  >
                    <PaymentForm 
                      invoiceId={invoiceId}
                      invoice={invoiceData}
                      payerName={payerName}
                      payerEmail={payerEmail}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                    />
                  </Elements>
                  {errorMessage && localPaymentStatus === 'failed' && (
                    <Alert variant="destructive" data-testid="alert-payment-error">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Payment Failed</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  )}
                </>
              )
            )}
          </>
        )}

        {/* Already Paid Message */}
        {isPaid && (
          <Alert className="border-green-200 bg-muted/30 dark:bg-green-950 dark:border-green-800" data-testid="alert-already-paid">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-900 dark:text-green-100">Invoice Paid</AlertTitle>
            <AlertDescription className="text-green-800 dark:text-green-200">
              This invoice has already been paid. Thank you for your business!
            </AlertDescription>
          </Alert>
        )}

        {/* Security Notice */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Secure Payment Processing</p>
                <p className="text-xs text-muted-foreground">
                  All payments are securely processed through Stripe. Your payment information is encrypted and never stored on our servers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
