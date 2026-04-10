import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Receipt, DollarSign, MapPin, Calendar, FileText, Upload, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useIsMobile } from "@/hooks/use-mobile";

const expenseFormSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  expenseDate: z.string().min(1, "Date is required"),
  merchant: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().default("USD"),
  isBillable: z.boolean().default(false),
  clientId: z.string().optional(),
  projectCode: z.string().optional(),
  mileageDistance: z.string().optional(),
  mileageRate: z.string().optional(),
  mileageStartLocation: z.string().optional(),
  mileageEndLocation: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function ForceFlowBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div 
        className="bg-primary h-2 rounded-full transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default function ExpensesPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<any[]>({
    queryKey: ['/api/expenses/categories'],
  });

  const { data: expenses = [], isLoading: expensesLoading, refetch } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      categoryId: "",
      expenseDate: format(new Date(), "yyyy-MM-dd"),
      merchant: "",
      description: "",
      amount: "",
      currency: "USD",
      isBillable: false,
      clientId: "",
      projectCode: "",
      mileageDistance: "",
      mileageRate: "0.67",
      mileageStartLocation: "",
      mileageEndLocation: "",
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      setIsUploading(true);
      setUploadProgress(0);
      
      const expense = await apiRequest('POST', '/api/expenses', values);
      setUploadProgress(20);
      
      if (selectedFiles.length > 0) {
        const progressPerFile = 70 / selectedFiles.length;
        
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          
          const formData = new FormData();
          formData.append('file', file);
          // @ts-expect-error — TS migration: fix in refactoring sprint
          formData.append('path', `receipts/${expense.id}/${file.name}`);
          
          const uploadRes = await secureFetch('/api/object-storage/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadRes.ok) {
            throw new Error('Failed to upload receipt');
          }
          
          const { url } = await uploadRes.json();
          
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await apiRequest('POST', `/api/expenses/${expense.id}/receipts`, {
            fileName: file.name,
            fileUrl: url,
            fileType: file.type,
            fileSize: file.size,
          });
          
          setUploadProgress(20 + progressPerFile * (i + 1));
        }
      }
      
      setUploadProgress(100);
      setIsUploading(false);
      
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({
        title: "Success",
        description: "Expense submitted successfully",
      });
      setShowForm(false);
      form.reset();
      setSelectedFiles([]);
      setUploadProgress(0);
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit expense",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
    },
  });

  const onSubmit = (values: ExpenseFormValues) => {
    if (values.mileageDistance && values.mileageRate) {
      const calculatedAmount = (parseFloat(values.mileageDistance) * parseFloat(values.mileageRate)).toFixed(2);
      values.amount = calculatedAmount;
    }
    createExpenseMutation.mutate(values);
  };

  const isMileageCategory = (categoryId: string) => {
    const category = categories.find((c: any) => c.id === categoryId);
    return category?.name?.toLowerCase().includes('mileage');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'draft': 'secondary',
      'submitted': 'outline',
      'approved': 'default',
      'rejected': 'destructive',
      'reimbursed': 'default',
      'cancelled': 'secondary',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const handleRefresh = async () => {
    await refetch();
  };

  const pageConfig: CanvasPageConfig = {
    id: 'expenses',
    title: 'ExpenseOS™',
    subtitle: 'Submit and track your expense reimbursements',
    category: 'operations',
    onRefresh: handleRefresh,
    enablePullToRefresh: true,
    headerActions: !showForm ? (
      <Button
        onClick={() => setShowForm(true)}
        data-testid="button-new-expense"
      >
        <Plus className="w-4 h-4 mr-2" />
        New Expense
      </Button>
    ) : undefined,
  };

  if (categoriesLoading || expensesLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-3 sm:space-y-4 md:space-y-6" data-testid="page-expenses">
        {showForm && (
          <Card data-testid="card-expense-form">
            <CardHeader>
              <CardTitle>Submit Expense</CardTitle>
              <CardDescription>Fill out the form to submit a new expense for reimbursement</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expense Category</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              setSelectedCategory(value);
                            }}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((cat: any) => (
                                <SelectItem key={cat.id} value={cat.id} data-testid={`option-category-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expenseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expense Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-expense-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {!isMileageCategory(selectedCategory) ? (
                    <>
                      <FormField
                        control={form.control}
                        name="merchant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merchant/Vendor</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Office Depot" {...field} data-testid="input-merchant" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-amount" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  ) : (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="w-4 h-4" />
                        Mileage Reimbursement
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="mileageStartLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Location</FormLabel>
                              <FormControl>
                                <Input placeholder="123 Main St" {...field} data-testid="input-start-location" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="mileageEndLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Location</FormLabel>
                              <FormControl>
                                <Input placeholder="456 Oak Ave" {...field} data-testid="input-end-location" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="mileageDistance"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Miles Driven</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.1"
                                  placeholder="0.0"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    const miles = parseFloat(e.target.value);
                                    const rate = parseFloat(form.getValues("mileageRate") || "0.67");
                                    if (!isNaN(miles) && miles > 0) {
                                      form.setValue("amount", (miles * rate).toFixed(2));
                                    }
                                  }}
                                  data-testid="input-miles"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="mileageRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Rate per Mile ($)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder="0.670"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    const rate = parseFloat(e.target.value);
                                    const miles = parseFloat(form.getValues("mileageDistance") || "0");
                                    if (!isNaN(rate) && miles > 0) {
                                      form.setValue("amount", (miles * rate).toFixed(2));
                                    }
                                  }}
                                  data-testid="input-rate"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="text-sm text-muted-foreground">
                        Calculated amount: <span className="font-medium" data-testid="text-calculated-amount">${form.watch("amount") || "0.00"}</span>
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Provide details about the expense..."
                            className="resize-none"
                            {...field}
                            data-testid="textarea-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Receipt Attachments</label>
                    <div className="border-2 border-dashed rounded-md p-4">
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          if (e.target.files) {
                            setSelectedFiles(Array.from(e.target.files));
                          }
                        }}
                        className="hidden"
                        id="receipt-upload"
                        data-testid="input-receipt-upload"
                      />
                      <label
                        htmlFor="receipt-upload"
                        className="flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-8 h-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground text-center">
                          Click to upload receipts (images or PDFs)
                        </span>
                      </label>
                      {selectedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {selectedFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-muted rounded gap-2"
                              data-testid={`receipt-file-${index}`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <span className="text-sm truncate">{file.name}</span>
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  ({(file.size / 1024).toFixed(1)} KB)
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
                                }}
                                data-testid={`button-remove-receipt-${index}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {isUploading && (
                    <div className="space-y-2">
                      <ForceFlowBar progress={uploadProgress} />
                      <div className="text-center text-sm text-muted-foreground">
                        {uploadProgress < 20 && "Creating expense..."}
                        {uploadProgress >= 20 && uploadProgress < 90 && `Uploading receipts... ${Math.round(uploadProgress)}%`}
                        {uploadProgress >= 90 && "Finalizing..."}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowForm(false);
                        form.reset();
                      }}
                      disabled={isUploading}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createExpenseMutation.isPending || isUploading}
                      data-testid="button-submit-expense"
                    >
                      {isUploading ? "Uploading..." : createExpenseMutation.isPending ? "Submitting..." : "Submit Expense"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="all" className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-full min-w-max sm:grid sm:grid-cols-4 gap-0.5 sm:gap-1">
              <TabsTrigger value="all" className="text-[11px] sm:text-sm px-2 sm:px-3 whitespace-nowrap" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="submitted" className="text-[11px] sm:text-sm px-2 sm:px-3 whitespace-nowrap" data-testid="tab-submitted">Submitted</TabsTrigger>
              <TabsTrigger value="approved" className="text-[11px] sm:text-sm px-2 sm:px-3 whitespace-nowrap" data-testid="tab-approved">Approved</TabsTrigger>
              <TabsTrigger value="reimbursed" className="text-[11px] sm:text-sm px-2 sm:px-3 whitespace-nowrap" data-testid="tab-reimbursed">Reimbursed</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="space-y-4 mt-4">
            {expenses.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  No expenses submitted yet
                </CardContent>
              </Card>
            ) : (
              expenses.map((expense: any) => (
                <ExpenseCard key={expense.id} expense={expense} getStatusBadge={getStatusBadge} />
              ))
            )}
          </TabsContent>

          <TabsContent value="submitted" className="space-y-4 mt-4">
            {expenses.filter((e: any) => e.status === 'submitted').length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No submitted expenses
                </CardContent>
              </Card>
            ) : (
              expenses.filter((e: any) => e.status === 'submitted').map((expense: any) => (
                <ExpenseCard key={expense.id} expense={expense} getStatusBadge={getStatusBadge} />
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4 mt-4">
            {expenses.filter((e: any) => e.status === 'approved').length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No approved expenses
                </CardContent>
              </Card>
            ) : (
              expenses.filter((e: any) => e.status === 'approved').map((expense: any) => (
                <ExpenseCard key={expense.id} expense={expense} getStatusBadge={getStatusBadge} />
              ))
            )}
          </TabsContent>

          <TabsContent value="reimbursed" className="space-y-4 mt-4">
            {expenses.filter((e: any) => e.status === 'reimbursed').length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No reimbursed expenses
                </CardContent>
              </Card>
            ) : (
              expenses.filter((e: any) => e.status === 'reimbursed').map((expense: any) => (
                <ExpenseCard key={expense.id} expense={expense} getStatusBadge={getStatusBadge} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}

function ExpenseCard({ expense, getStatusBadge }: { expense: any; getStatusBadge: (status: string) => React.ReactNode }) {
  return (
    <Card data-testid={`card-expense-${expense.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 sm:gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm sm:text-base md:text-lg truncate">{expense.description}</CardTitle>
            <CardDescription className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap text-[11px] sm:text-xs md:text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0" />
                {format(new Date(expense.expenseDate), "MMM dd, yyyy")}
              </span>
              {expense.merchant && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[120px] sm:max-w-none">{expense.merchant}</span>
                </>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1 sm:gap-2 shrink-0">
            <div className="text-base sm:text-lg md:text-2xl font-bold whitespace-nowrap" data-testid={`text-amount-${expense.id}`}>
              ${parseFloat(expense.amount).toFixed(2)}
            </div>
            {getStatusBadge(expense.status)}
          </div>
        </div>
      </CardHeader>
      {expense.reviewNotes && (
        <CardContent>
          <div className="text-xs sm:text-sm pl-3 sm:pl-4 py-2 border-l-2 sm:border-l-4 border-primary">
            <div className="font-medium mb-1">Review Notes</div>
            <div className="text-muted-foreground">{expense.reviewNotes}</div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
