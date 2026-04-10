import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, Building2, User, Mail, Phone, Lock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function ClientSignup() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const params = new URLSearchParams(search);
  const tempCode = params.get('code') || '';
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { data: prospectData, isLoading: isLoadingProspect, error: prospectError } = useQuery({
    queryKey: ['/api/client-status', tempCode],
    queryFn: async () => {
      if (!tempCode) return null;
      const res = await fetch(`/api/client-status/${tempCode}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Invalid access code');
      }
      return res.json();
    },
    enabled: !!tempCode,
    retry: false,
  });
  
  useEffect(() => {
    if (prospectData?.prospect) {
      setFormData(prev => ({
        ...prev,
        email: prospectData.prospect.email || '',
        companyName: prospectData.prospect.companyName || '',
        phone: prospectData.prospect.phone || '',
        firstName: prospectData.prospect.contactName?.split(' ')[0] || '',
        lastName: prospectData.prospect.contactName?.split(' ').slice(1).join(' ') || '',
      }));
    }
  }, [prospectData]);
  
  const signupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/client-signup', {
        tempCode,
        ...formData,
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Account Created',
        description: 'Your account has been created successfully. Please log in.',
      });
      setLocation('/login');
    },
    onError: (error: Error) => {
      toast({
        title: 'Signup Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      signupMutation.mutate();
    }
  };
  
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };
  
  if (!tempCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xs">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Missing Access Code
            </CardTitle>
            <CardDescription>
              Please use the signup link from your email to create your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setLocation('/client-status-lookup')}
              data-testid="button-lookup-status"
            >
              Look Up Request Status
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (isLoadingProspect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying access code...</p>
        </div>
      </div>
    );
  }
  
  if (prospectError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xs">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Invalid Access Code
            </CardTitle>
            <CardDescription>
              {(prospectError as Error).message || 'The access code is invalid or has expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setLocation('/client-status-lookup')}
              data-testid="button-lookup-status"
            >
              Look Up Request Status
            </Button>
            <Button 
              variant="ghost" 
              className="w-full"
              onClick={() => setLocation('/login')}
              data-testid="button-login"
            >
              Already have an account? Log in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const prospect = prospectData?.prospect;
  const workspace = prospectData?.workspace;
  
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-xs mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Create Your Account</h1>
          <p className="text-muted-foreground">
            Complete your registration with {workspace?.name || 'the service provider'}
          </p>
        </div>
        
        {prospect?.accessStatus === 'converted' && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              This access code has already been used to create an account.{' '}
              {/* @ts-ignore */}
              <Button variant="link" className="p-0 h-auto" onClick={() => setLocation('/login')}>
                Log in instead
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Details
            </CardTitle>
            <CardDescription>
              Access code: <span className="font-mono">{tempCode}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      className="pl-9"
                      placeholder="John"
                      data-testid="input-first-name"
                    />
                  </div>
                  {errors.firstName && (
                    <p className="text-sm text-destructive">{errors.firstName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder="Smith"
                    data-testid="input-last-name"
                  />
                  {errors.lastName && (
                    <p className="text-sm text-destructive">{errors.lastName}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-9"
                    placeholder="john@company.com"
                    data-testid="input-email"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="pl-9"
                    placeholder="Enter phone number"
                    data-testid="input-phone"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className="pl-9"
                    placeholder="Acme Corporation"
                    data-testid="input-company"
                  />
                </div>
              </div>
              
              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      className="pl-9"
                      placeholder="At least 8 characters"
                      data-testid="input-password"
                    />
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      className="pl-9"
                      placeholder="Confirm your password"
                      data-testid="input-confirm-password"
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={signupMutation.isPending || prospect?.accessStatus === 'converted'}
                data-testid="button-signup"
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
              
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Button 
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  variant="link" 
                  className="p-0 h-auto"
                  onClick={() => setLocation('/login')}
                  data-testid="link-login"
                >
                  Log in
                </Button>
              </p>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-xs text-muted-foreground">
          By creating an account, you agree to the terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
