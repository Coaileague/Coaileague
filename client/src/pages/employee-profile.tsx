import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Phone, Mail, MapPin, Lock, Unlock, Shield, FileText, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function EmployeeProfile() {
  const { toast } = useToast();
  const [isEditingContact, setIsEditingContact] = useState(false);

  // Fetch current user
  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/me'],
  });

  // Fetch employee profile
  const { data: employee, isLoading } = useQuery<any>({
    queryKey: ['/api/employees/me'],
    enabled: !!currentUser,
  });

  // Fetch locked documents
  const { data: lockedDocuments } = useQuery<any[]>({
    queryKey: ['/api/hireos/documents/me'],
    enabled: !!employee,
  });

  const [contactInfo, setContactInfo] = useState({
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
  });

  // CRITICAL FIX: Load contact info when employee data loads (useEffect to prevent infinite render)
  useEffect(() => {
    if (employee && !isEditingContact) {
      setContactInfo({
        phone: employee.phone || '',
        email: employee.email || '',
        address: employee.address || '',
        city: employee.city || '',
        state: employee.state || '',
        zipCode: employee.zipCode || '',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactPhone: employee.emergencyContactPhone || '',
        emergencyContactRelation: employee.emergencyContactRelation || '',
      });
    }
  }, [employee, isEditingContact]);

  // Update contact info mutation
  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/employees/me/contact-info', 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees/me'] });
      setIsEditingContact(false);
      toast({
        title: "Contact Info Updated",
        description: "Your contact information has been successfully updated",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Unable to update contact information. Please try again.",
      });
    },
  });

  const handleSaveContact = () => {
    updateContactMutation.mutate(contactInfo);
  };

  const handleCancelEdit = () => {
    setIsEditingContact(false);
    // Reset to original values from employee data
    if (employee) {
      setContactInfo({
        phone: employee.phone || '',
        email: employee.email || '',
        address: employee.address || '',
        city: employee.city || '',
        state: employee.state || '',
        zipCode: employee.zipCode || '',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactPhone: employee.emergencyContactPhone || '',
        emergencyContactRelation: employee.emergencyContactRelation || '',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertDescription>Employee profile not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const lockedDocumentTypes = lockedDocuments?.filter((doc: any) => doc.isImmutable) || [];

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <User className="h-8 w-8" />
          Employee Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your personal information and view locked records
        </p>
      </div>

      {/* Security & Compliance Notice */}
      <Alert className="mb-6">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Document Security:</strong> Update contact info anytime. Legal documents (I-9, W-4, signatures) are permanently locked for compliance and audit trail purposes.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6">
        {/* Basic Employee Info (Read-Only) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-destructive" />
                  Employee Identity (Locked)
                </CardTitle>
                <CardDescription>These fields cannot be changed after onboarding</CardDescription>
              </div>
              <Badge variant="secondary">
                <Lock className="h-3 w-3 mr-1" />
                Immutable
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">First Name</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.firstName}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Name</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.lastName}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Employee Number</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.employeeNumber || 'Pending'}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Role</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.role || 'N/A'}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information (Editable) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Unlock className="h-5 w-5 text-green-600" />
                  Contact Information (Editable)
                </CardTitle>
                <CardDescription>Keep your contact information up to date</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <Unlock className="h-3 w-3 mr-1" />
                  Editable
                </Badge>
                {!isEditingContact && (
                  <Button onClick={() => setIsEditingContact(true)} data-testid="button-edit-contact">
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Phone Number</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.phone}
                      onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      data-testid="input-phone"
                    />
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{employee.phone || 'Not provided'}</p>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Email Address</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.email}
                      onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
                      type="email"
                      placeholder="you@example.com"
                      data-testid="input-email"
                    />
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{employee.email || 'Not provided'}</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <Label>Street Address</Label>
                {isEditingContact ? (
                  <Input
                    value={contactInfo.address}
                    onChange={(e) => setContactInfo({ ...contactInfo, address: e.target.value })}
                    placeholder="123 Main St"
                    data-testid="input-address"
                  />
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{employee.address || 'Not provided'}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>City</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.city}
                      onChange={(e) => setContactInfo({ ...contactInfo, city: e.target.value })}
                      placeholder="New York"
                      data-testid="input-city"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.city || 'N/A'}</p>
                  )}
                </div>
                <div>
                  <Label>State</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.state}
                      onChange={(e) => setContactInfo({ ...contactInfo, state: e.target.value })}
                      placeholder="NY"
                      maxLength={2}
                      data-testid="input-state"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.state || 'N/A'}</p>
                  )}
                </div>
                <div>
                  <Label>ZIP Code</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.zipCode}
                      onChange={(e) => setContactInfo({ ...contactInfo, zipCode: e.target.value })}
                      placeholder="10001"
                      data-testid="input-zip"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.zipCode || 'N/A'}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Emergency Contact Name</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.emergencyContactName}
                      onChange={(e) => setContactInfo({ ...contactInfo, emergencyContactName: e.target.value })}
                      placeholder="Jane Doe"
                      data-testid="input-emergency-name"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.emergencyContactName || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label>Emergency Contact Phone</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.emergencyContactPhone}
                      onChange={(e) => setContactInfo({ ...contactInfo, emergencyContactPhone: e.target.value })}
                      placeholder="(555) 987-6543"
                      data-testid="input-emergency-phone"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.emergencyContactPhone || 'Not provided'}</p>
                  )}
                </div>
              </div>

              {isEditingContact && (
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSaveContact}
                    disabled={updateContactMutation.isPending}
                    data-testid="button-save-contact"
                  >
                    {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={updateContactMutation.isPending}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Locked Documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-destructive" />
                  Permanently Locked Documents
                </CardTitle>
                <CardDescription>Legal documents cannot be modified after approval</CardDescription>
              </div>
              <Badge variant="destructive">
                <Lock className="h-3 w-3 mr-1" />
                Immutable
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {lockedDocumentTypes.length > 0 ? (
              <div className="space-y-3">
                {lockedDocumentTypes.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg" data-testid={`locked-doc-${doc.id}`}>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{doc.documentName}</p>
                        <p className="text-xs text-muted-foreground">
                          Approved on {new Date(doc.approvedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <Badge variant="secondary">
                        <Lock className="h-3 w-3 mr-1" />
                        Locked
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Lock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No locked documents yet</p>
                <p className="text-sm mt-1">Legal documents will appear here after approval</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
