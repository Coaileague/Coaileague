import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ReenableChatButton } from "@/components/reenable-chat-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  Mail,
  MessageSquare,
  Clock,
  MapPin,
  Send,
  HeadphonesIcon,
  Briefcase,
  Zap,
  CheckCircle2,
  Globe,
} from "lucide-react";

export default function Contact() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Check if user is authenticated
  const { data: currentUser, isLoading: isLoadingAuth } = useQuery<{ user: { id: string; email: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  
  const isAuthenticated = !!currentUser?.user;
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    subject: "",
    tier: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/contact", data);
    },
    onSuccess: (response: any) => {
      setIsSubmitted(true);
      setTicketNumber(response.ticketNumber);
      toast({
        title: "Support Ticket Created",
        description: `Your ticket number is ${response.ticketNumber}. Save it to access Live Chat.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit contact form. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-slate-gradient text-white">
      {/* Top Bar */}
      <div className="h-16 bg-card-translucent border-b border-primary/20 backdrop-blur-sm flex items-center justify-between px-6">
        <AutoForceLogo size="sm" variant="full" />
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/"}
            className="text-xs h-8 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))] hover:bg-[hsl(var(--cad-chrome-hover))]"
            data-testid="button-back"
          >
            Back
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.href = "/api/login"}
            className="h-8 text-xs bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white"
            data-testid="button-launch-platform"
          >
            Launch Platform
          </Button>
        </div>
      </div>

      {/* Contact Hero */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center space-y-4 mb-12">
          <div className="flex items-center justify-center gap-2">
            <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
            <span className="text-xs uppercase tracking-wider text-[hsl(var(--cad-text-tertiary))] font-mono">
              Enterprise Support
            </span>
            <div className="h-1 w-12 bg-[hsl(var(--cad-blue))]" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-contact">
            Contact Our Team
          </h1>
          <p className="text-lg text-[hsl(var(--cad-text-secondary))] max-w-2xl mx-auto">
            Elite-grade support for your workforce operations. Our experts are available 24/7 to ensure your success.
          </p>
        </div>

        {/* Support Channels Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4" data-testid="card-email-support">
            <div className="h-12 w-12 rounded-md bg-[hsl(var(--cad-cyan))]/10 flex items-center justify-center">
              <Mail className="h-6 w-6 text-[hsl(var(--cad-cyan))]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Email Support</h3>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Get detailed technical assistance
              </p>
              <div className="space-y-1 pt-2">
                <a
                  href="mailto:support@getdc360.com"
                  className="text-sm font-mono text-[hsl(var(--cad-blue))] hover:underline block"
                  data-testid="link-email-support"
                >
                  support@getdc360.com
                </a>
                <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                  Response time: &lt;24 hours
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4" data-testid="card-live-chat">
            <div className="h-12 w-12 rounded-md bg-[hsl(var(--cad-purple))]/10 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-[hsl(var(--cad-purple))]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Live Chat</h3>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Instant answers from our team
              </p>
              <div className="pt-2">
                <Link href="/chat">
                  <Button
                    size="sm"
                    className="bg-[hsl(var(--cad-purple))] hover:bg-[hsl(var(--cad-purple))]/90 text-white h-9"
                    data-testid="button-start-chat"
                    disabled={isLoadingAuth}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Start Chat
                  </Button>
                </Link>
                <p className="text-xs text-[hsl(var(--cad-text-tertiary))] mt-2">
                  Available 24/7 for all tiers
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Support Tiers */}
        <Card className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border-strong))] mb-16" data-testid="card-support-tiers">
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Enterprise Support Tiers</h2>
              <p className="text-sm text-[hsl(var(--cad-text-tertiary))]">
                Comprehensive support packages for businesses of all sizes
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <HeadphonesIcon className="h-5 w-5 text-[hsl(var(--cad-green))]" />
                  <h3 className="font-semibold">Standard Support</h3>
                </div>
                <ul className="space-y-2 text-sm text-[hsl(var(--cad-text-secondary))]">
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-green))]">•</span>
                    Email & chat support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-green))]">•</span>
                    Response within 4 hours
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-green))]">•</span>
                    Knowledge base access
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-green))]">•</span>
                    Community forum
                  </li>
                </ul>
                <Badge className="bg-[hsl(var(--cad-green))]/10 text-[hsl(var(--cad-green))] border-none">
                  Included in Starter
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-[hsl(var(--cad-blue))]" />
                  <h3 className="font-semibold">Priority Support</h3>
                </div>
                <ul className="space-y-2 text-sm text-[hsl(var(--cad-text-secondary))]">
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-blue))]">•</span>
                    Phone, email & chat support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-blue))]">•</span>
                    Response within 1 hour
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-blue))]">•</span>
                    Dedicated support engineer
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-blue))]">•</span>
                    Quarterly business reviews
                  </li>
                </ul>
                <Badge className="bg-[hsl(var(--cad-blue))]/10 text-[hsl(var(--cad-blue))] border-none">
                  Included in Professional
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-[hsl(var(--cad-purple))]" />
                  <h3 className="font-semibold">White-Glove Support</h3>
                </div>
                <ul className="space-y-2 text-sm text-[hsl(var(--cad-text-secondary))]">
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-purple))]">•</span>
                    24/7 priority phone support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-purple))]">•</span>
                    Response within 15 minutes
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-purple))]">•</span>
                    Dedicated account manager
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[hsl(var(--cad-purple))]">•</span>
                    Custom SLA & integrations
                  </li>
                </ul>
                <Badge className="bg-[hsl(var(--cad-purple))]/10 text-[hsl(var(--cad-purple))] border-none">
                  Included in Enterprise
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Contact Form */}
        <div className="grid lg:grid-cols-2 gap-12">
          <div className="space-y-6">
            {!isSubmitted ? (
              <>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">Send Us a Message</h2>
                  <p className="text-[hsl(var(--cad-text-secondary))]">
                    Fill out the form and our team will get back to you within 24 hours.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contact">
                  <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Smith"
                    required
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@company.com"
                    required
                    data-testid="input-email"
                  />
                </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Acme Corp"
                    data-testid="input-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    data-testid="input-phone"
                  />
                </div>
                  </div>

                  <div className="space-y-2">
                <Label htmlFor="tier">Current/Interested Tier</Label>
                <Select
                  value={formData.tier}
                  onValueChange={(value) => setFormData({ ...formData, tier: value })}
                >
                  <SelectTrigger id="tier" data-testid="select-tier">
                    <SelectValue placeholder="Select a tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter - $199/mo</SelectItem>
                    <SelectItem value="professional">Professional - $799/mo</SelectItem>
                    <SelectItem value="enterprise">Enterprise - $2,499/mo</SelectItem>
                    <SelectItem value="custom">Custom Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                  </div>

                  <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="How can we help?"
                  required
                  data-testid="input-subject"
                />
                  </div>

                  <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Tell us about your workforce management needs..."
                  rows={6}
                  required
                  data-testid="input-message"
                />
                  </div>

                  <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90 text-white h-11"
                data-testid="button-submit-contact"
              >
                {submitMutation.isPending ? (
                  <>
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Message
                  </>
                )}
                  </Button>
                </form>
              </>
            ) : (
              <Card className="bg-[hsl(var(--cad-green))]/10 border-[hsl(var(--cad-green))]/20 p-8 space-y-6" data-testid="card-success">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-[hsl(var(--cad-green))]/20 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-[hsl(var(--cad-green))]" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-bold text-[hsl(var(--cad-text-primary))]">Support Ticket Created!</h3>
                    <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                      Our team will respond within 24 hours
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3 p-4 bg-[hsl(var(--cad-background))] rounded-md border border-[hsl(var(--cad-border-strong))]">
                  <p className="text-sm font-semibold text-[hsl(var(--cad-text-primary))]">Your Ticket Number:</p>
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-2xl font-bold font-mono text-[hsl(var(--cad-green))]" data-testid="text-ticket-number">
                      {ticketNumber}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(ticketNumber);
                        toast({
                          title: "Copied!",
                          description: "Ticket number copied to clipboard",
                        });
                      }}
                      className="border-[hsl(var(--cad-green))] text-[hsl(var(--cad-green))] hover:bg-[hsl(var(--cad-green))]/10"
                      data-testid="button-copy-ticket"
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                    Save this number! You'll need it to access Live Chat support.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => setLocation("/chat")}
                    className="flex-1 bg-[hsl(var(--cad-purple))] hover:bg-[hsl(var(--cad-purple))]/90 text-white"
                    data-testid="button-goto-chat"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Go to Live Chat
                  </Button>
                  <Button
                    onClick={() => {
                      setIsSubmitted(false);
                      setTicketNumber("");
                      setFormData({
                        name: "",
                        email: "",
                        company: "",
                        phone: "",
                        subject: "",
                        tier: "",
                        message: "",
                      });
                    }}
                    variant="outline"
                    className="border-[hsl(var(--cad-border-strong))]"
                    data-testid="button-send-another"
                  >
                    New Ticket
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-[hsl(var(--cad-blue))]" />
                <h3 className="font-semibold">Business Hours</h3>
              </div>
              <div className="space-y-2 text-sm text-[hsl(var(--cad-text-secondary))]">
                <div className="flex justify-between">
                  <span>Monday - Friday:</span>
                  <span className="font-mono">6:00 AM - 10:00 PM EST</span>
                </div>
                <div className="flex justify-between">
                  <span>Saturday - Sunday:</span>
                  <span className="font-mono">8:00 AM - 8:00 PM EST</span>
                </div>
                <div className="pt-2 border-t border-[hsl(var(--cad-border))]">
                  <Badge className="bg-[hsl(var(--cad-green))]/10 text-[hsl(var(--cad-green))] border-none">
                    24/7 Emergency Support Available
                  </Badge>
                </div>
              </div>
            </Card>

            <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-[hsl(var(--cad-cyan))]" />
                <h3 className="font-semibold">Online Business</h3>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-[hsl(var(--cad-text-secondary))]">
                  AutoForce™ is a fully online platform. All support and communications are handled digitally for maximum efficiency.
                </p>
                <div className="pt-2 space-y-1">
                  <p className="text-xs font-semibold text-[hsl(var(--cad-text-primary))]">General Inquiries:</p>
                  <a
                    href="mailto:info@getdc360.com"
                    className="text-sm font-mono text-[hsl(var(--cad-blue))] hover:underline block"
                    data-testid="link-email-info"
                  >
                    info@getdc360.com
                  </a>
                </div>
              </div>
            </Card>

            <Card className="bg-[hsl(var(--cad-blue))]/10 border-[hsl(var(--cad-blue))]/20 p-6 space-y-2">
              <h3 className="font-semibold text-[hsl(var(--cad-text-primary))]">Enterprise Inquiries</h3>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                Managing 100+ employees? Contact our team for custom pricing and dedicated onboarding.
              </p>
              <Button
                variant="outline"
                className="border-[hsl(var(--cad-blue))] text-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/10"
                onClick={() => window.location.href = "mailto:info@getdc360.com"}
                data-testid="button-enterprise-contact"
              >
                Contact Us
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--cad-border))] bg-[hsl(var(--cad-chrome))]">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--cad-text-tertiary))]">
              <AutoForceLogo size="sm" variant="icon" />
              <span>© 2025 AutoForce™. Elite-grade workforce automation.</span>
            </div>
            <div className="flex items-center gap-6">
              <ReenableChatButton />
              <div className="flex gap-6 text-xs text-[hsl(var(--cad-text-tertiary))]">
                <a href="/support" className="hover:text-[hsl(var(--cad-text-primary))]" data-testid="link-support">
                  Support Center
                </a>
                <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">
                  Privacy
                </a>
                <a href="#" className="hover:text-[hsl(var(--cad-text-primary))]">
                  Terms
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
