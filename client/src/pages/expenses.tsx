import { useState } from "react";
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
import { Plus, Receipt, DollarSign, MapPin, Calendar, FileText, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ForceFlowBar } from "@/components/loading-indicators";

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

export default function ExpensesPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<any[]>({
    queryKey: ['/api/expense-categories'],
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery<any[]>({
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
      
      const expense = await apiRequest('/api/expenses', 'POST', values);
      setUploadProgress(20);
      
      // Upload receipts if any selected
      if (selectedFiles.length > 0) {
        const progressPerFile = 70 / selectedFiles.length;
        
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          
          // Upload to object storage
          const formData = new FormData();
          formData.append('file', file);
          formData.append('path', `receipts/${expense.id}/${file.name}`);
          
          const uploadRes = await fetch('/api/object-storage/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadRes.ok) {
            throw new Error('Failed to upload receipt');
          }
          
          const { url } = await uploadRes.json();
          
          // Create receipt record
          await apiRequest(`/api/expenses/${expense.id}/receipts`, 'POST', {
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
    // Calculate mileage amount if distance provided
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

  if (categoriesLoading || expensesLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl" data-testid="page-expenses">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-expenses">ExpenseOS™</h1>
          <p className="text-muted-foreground">Submit and track your expense reimbursements</p>
        </div>
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            data-testid="button-new-expense"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Expense
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-6" data-testid="card-expense-form">
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
                      <span className="text-sm text-muted-foreground">
                        Click to upload receipts (images or PDFs)
                      </span>
                    </label>
                    {selectedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-muted rounded"
                            data-testid={`receipt-file-${index}`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              <span className="text-sm">{file.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ({(file.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
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

                {/* Upload Progress Indicator */}
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

                <div className="flex gap-2 justify-end">
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
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All Expenses</TabsTrigger>
          <TabsTrigger value="submitted" data-testid="tab-submitted">Submitted</TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="reimbursed" data-testid="tab-reimbursed">Reimbursed</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {expenses.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20" />
                No expenses submitted yet
              </CardContent>
            </Card>
          ) : (
            expenses.map((expense: any) => (
              <Card key={expense.id} data-testid={`card-expense-${expense.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{expense.description}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(expense.expenseDate), "MMM dd, yyyy")}
                        {expense.merchant && (
                          <>
                            <span>•</span>
                            {expense.merchant}
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-2xl font-bold" data-testid={`text-amount-${expense.id}`}>
                        ${parseFloat(expense.amount).toFixed(2)}
                      </div>
                      {getStatusBadge(expense.status)}
                    </div>
                  </div>
                </CardHeader>
                {expense.reviewNotes && (
                  <CardContent>
                    <div className="text-sm border-l-4 border-primary pl-4 py-2">
                      <div className="font-medium mb-1">Review Notes</div>
                      <div className="text-muted-foreground">{expense.reviewNotes}</div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="submitted">
          {expenses.filter((e: any) => e.status === 'submitted').map((expense: any) => (
            <Card key={expense.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{expense.description}</CardTitle>
                    <CardDescription>{format(new Date(expense.expenseDate), "MMM dd, yyyy")}</CardDescription>
                  </div>
                  <div className="text-2xl font-bold">${parseFloat(expense.amount).toFixed(2)}</div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="approved">
          {expenses.filter((e: any) => e.status === 'approved').map((expense: any) => (
            <Card key={expense.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{expense.description}</CardTitle>
                    <CardDescription>{format(new Date(expense.expenseDate), "MMM dd, yyyy")}</CardDescription>
                  </div>
                  <div className="text-2xl font-bold">${parseFloat(expense.amount).toFixed(2)}</div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="reimbursed">
          {expenses.filter((e: any) => e.status === 'reimbursed').map((expense: any) => (
            <Card key={expense.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{expense.description}</CardTitle>
                    <CardDescription>{format(new Date(expense.expenseDate), "MMM dd, yyyy")}</CardDescription>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">${parseFloat(expense.amount).toFixed(2)}</div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
