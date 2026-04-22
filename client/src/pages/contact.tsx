import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { CONTACTS, DOMAINS } from "@shared/platformConfig";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalHeader } from "@/components/universal-header";
import { SEO, PAGE_SEO } from '@/components/seo';
import { Footer } from "@/components/footer";
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
  Building2,
  Bot,
  Volume2,
  PhoneCall,
  Sparkles,
  ShieldCheck,
  Brain,
  Lock,
  Users,
  Cpu,
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
        title: "Message Received",
        description: `Trinity AI is reviewing your request. Ticket: ${response.ticketNumber}`,
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEO
        title={PAGE_SEO.contact.title}
        description={PAGE_SEO.contact.description}
        canonical={DOMAINS.contactUrl}
      />
      {/* Universal Header */}
      <UniversalHeader variant="public" />

      <main className="flex-1">
      {/* Contact Hero */}
      <section className="container mx-auto px-3 sm:px-6 pt-16 sm:pt-24 pb-8 sm:pb-16 bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50 dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900">
        <div className="text-center space-y-3 sm:space-y-4 mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-2">
            <div className="h-1 w-8 sm:w-12 bg-gradient-to-r from-cyan-600 to-blue-600" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground dark:text-gray-400 font-mono">
              Enterprise Support
            </span>
            <div className="h-1 w-8 sm:w-12 bg-gradient-to-r from-cyan-600 to-blue-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight text-foreground dark:text-gray-100 px-2" data-testid="heading-contact">
            Contact Our Team
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground dark:text-gray-400 max-w-2xl mx-auto px-2">
            Elite-grade support for your workforce operations. Our experts are available 24/7 to ensure your success.
          </p>
        </div>

        {/* Trinity AI Voice Banner */}
        <Card className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/40 shadow-lg mb-6 sm:mb-10 overflow-hidden" data-testid="card-trinity-voice-banner">
          <div className="p-5 sm:p-8">
            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="h-14 w-14 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-7 w-7 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-lg sm:text-xl font-bold text-white">Meet Trinity</h2>
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs">AI Voice System</Badge>
                  </div>
                  <p className="text-sm text-indigo-200 leading-relaxed">
                    Trinity is CoAIleague's 24/7 AI co-pilot — available by phone, chat, and email. She answers your calls using a multi-node AI architecture to ensure every response is accurate, empathetic, and actionable.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <div className="text-center p-3 rounded-md bg-card/5 border border-white/10 min-w-[120px]">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Volume2 className="h-4 w-4 text-amber-400" />
                    <span className="text-xs text-indigo-300 font-medium uppercase tracking-wide">Voice</span>
                  </div>
                  <a
                    href="tel:+18664644151"
                    className="text-base font-bold text-white hover:text-amber-300 transition-colors font-mono"
                    data-testid="link-trinity-phone"
                  >
                    {import.meta.env.VITE_TRINITY_PHONE || "+1 (866) 464-4151"}
                  </a>
                  <p className="text-xs text-indigo-400 mt-0.5">Toll-free · 24/7</p>
                </div>
                <div className="text-center p-3 rounded-md bg-card/5 border border-white/10 min-w-[120px]">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Mail className="h-4 w-4 text-amber-400" />
                    <span className="text-xs text-indigo-300 font-medium uppercase tracking-wide">Email</span>
                  </div>
                  <a
                    href={`mailto:${CONTACTS.trinity}`}
                    className="text-sm font-bold text-white hover:text-amber-300 transition-colors font-mono"
                    data-testid="link-trinity-email"
                  >
                    {CONTACTS.trinity}
                  </a>
                  <p className="text-xs text-indigo-400 mt-0.5">Always-on AI</p>
                </div>
              </div>
            </div>

            {/* Voice Menu Extensions */}
            <div className="mt-6 pt-5 border-t border-white/10">
              <p className="text-xs text-indigo-300 uppercase tracking-wider font-medium mb-3">When you call, Trinity answers and walks you through:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  { num: "1", label: "Sales", icon: Sparkles },
                  { num: "2", label: "Client Support", icon: HeadphonesIcon },
                  { num: "3", label: "Employment Verify", icon: ShieldCheck },
                  { num: "4", label: "Staff Self-Service", icon: Users },
                  { num: "5", label: "Emergency", icon: PhoneCall },
                  { num: "6", label: "Careers", icon: Briefcase },
                ].map(({ num, label, icon: Icon }) => (
                  <div key={num} className="flex items-center gap-2 p-2 rounded-md bg-card/5 border border-white/10">
                    <span className="h-6 w-6 rounded flex items-center justify-center bg-amber-500/20 text-amber-300 text-xs font-bold flex-shrink-0">
                      {num}
                    </span>
                    <div className="min-w-0">
                      <Icon className="h-3 w-3 text-indigo-300 mb-0.5" />
                      <p className="text-xs text-indigo-200 leading-tight truncate">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-indigo-400 mt-3">
                Trinity is also available in Spanish — Marque 9 para Español. Powered by Amazon Polly Neural voice technology.
              </p>
            </div>
          </div>
        </Card>

        {/* Support Channels Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-16">
          <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4" data-testid="card-trinity-phone-channel">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-md bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
              <Phone className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-semibold text-foreground dark:text-gray-100">Trinity Voice</h3>
              <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400">
                Speak directly to Trinity's AI — available around the clock
              </p>
              <div className="space-y-1 pt-2">
                <a
                  href="tel:+18664644151"
                  className="text-xs sm:text-sm font-mono text-amber-600 hover:underline block"
                  data-testid="link-phone-channel"
                >
                  {import.meta.env.VITE_TRINITY_PHONE || "+1 (866) 464-4151"}
                </a>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  Available 24/7 · Bilingual (EN/ES)
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4" data-testid="card-email-support">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-violet-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-semibold text-foreground dark:text-gray-100">Email Support</h3>
              <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400">
                Get detailed technical assistance
              </p>
              <div className="space-y-1 pt-2">
                <a
                  href={`mailto:${CONTACTS.trinity}`}
                  className="text-xs sm:text-sm font-mono text-violet-600 hover:underline block break-all"
                  data-testid="link-email-support"
                >
                  {CONTACTS.trinity}
                </a>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  Response time: &lt;24 hours
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4" data-testid="card-live-chat">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-md bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-semibold text-foreground dark:text-gray-100">Live Chat</h3>
              <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400">
                Instant answers from our team
              </p>
              <div className="pt-2">
                <Link href="/chatrooms">
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white min-h-[44px] shadow-md"
                    data-testid="button-start-chat"
                    disabled={isLoadingAuth}
                  >
                    <MessageSquare className="h-4 w-4 mr-2 shrink-0" />
                    Start Chat
                  </Button>
                </Link>
                <p className="text-xs text-muted-foreground dark:text-gray-400 mt-2">
                  Available 24/7 for all tiers
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Support Tiers */}
        <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md mb-16" data-testid="card-support-tiers">
          <div className="p-5 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground dark:text-gray-100">Enterprise Support Tiers</h2>
              <p className="text-sm text-muted-foreground">
                Comprehensive support packages for businesses of all sizes
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <HeadphonesIcon className="h-5 w-5 text-violet-600" />
                  <h3 className="font-semibold text-foreground dark:text-gray-100">Standard Support</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-violet-600">•</span>
                    Email & chat support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-600">•</span>
                    Response within 4 hours
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-600">•</span>
                    Knowledge base access
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-violet-600">•</span>
                    Community forum
                  </li>
                </ul>
                <Badge className="bg-violet-50 dark:bg-violet-950/50 text-violet-600 border-none">
                  Included in Starter
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold text-foreground dark:text-gray-100">Priority Support</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600">•</span>
                    Phone, email & chat support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600">•</span>
                    Response within 1 hour
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600">•</span>
                    Dedicated support engineer
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-600">•</span>
                    Quarterly business reviews
                  </li>
                </ul>
                <Badge className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 border-none">
                  Included in Professional
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold text-foreground dark:text-gray-100">White-Glove Support</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">•</span>
                    24/7 priority phone support
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">•</span>
                    Response within 15 minutes
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">•</span>
                    Dedicated account manager
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600">•</span>
                    Custom SLA & integrations
                  </li>
                </ul>
                <Badge className="bg-purple-50 dark:bg-purple-950/50 text-purple-600 border-none">
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
                  <p className="text-muted-foreground">
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
                    placeholder="Enter phone number"
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
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white h-11"
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
              <Card className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 shadow-md p-5 space-y-6" data-testid="card-success">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-8 w-8 text-violet-600" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-xl font-bold text-foreground">Message Received!</h3>
                    <p className="text-sm text-muted-foreground">
                      Trinity AI is reviewing your request now
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-md">
                  <div className="shrink-0 mt-0.5">
                    <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5" />
                      Trinity AI is working your ticket
                    </p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-500/70 mt-0.5 leading-relaxed">
                      She'll respond shortly. If she can't resolve it, your ticket is automatically passed to a human agent — no action needed from you.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3 p-4 bg-card dark:bg-card rounded-md border border-border shadow-sm">
                  <p className="text-sm font-semibold text-foreground">Your Ticket Number:</p>
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-xl font-bold font-mono text-violet-600" data-testid="text-ticket-number">
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
                      className="border-violet-600 text-violet-600"
                      data-testid="button-copy-ticket"
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save this number! You'll need it to access Live Chat support if escalated.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => setLocation("/chatrooms")}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md"
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
                    className="border-border"
                    data-testid="button-send-another"
                  >
                    New Ticket
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-violet-600" />
                <h3 className="font-semibold text-foreground dark:text-gray-100">Business Hours</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground dark:text-gray-400">
                <div className="flex justify-between gap-2">
                  <span>Monday - Friday:</span>
                  <span className="font-mono">6:00 AM - 10:00 PM EST</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Saturday - Sunday:</span>
                  <span className="font-mono">8:00 AM - 8:00 PM EST</span>
                </div>
                <div className="pt-2 border-t border-border dark:border-gray-700">
                  <Badge className="bg-violet-50 dark:bg-violet-950/50 text-violet-600 border-none">
                    24/7 Emergency Support Available
                  </Badge>
                </div>
              </div>
            </Card>

            <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold text-foreground dark:text-gray-100">Online Business</h3>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground dark:text-gray-400">
                  CoAIleague is a fully online platform. All support and communications are handled digitally for maximum efficiency.
                </p>
                <div className="pt-2 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground dark:text-gray-100">Trinity AI:</p>
                    <a
                      href={`mailto:${CONTACTS.trinity}`}
                      className="text-sm font-mono text-amber-600 hover:underline block"
                      data-testid="link-email-trinity"
                    >
                      {CONTACTS.trinity}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground dark:text-gray-100">General Support:</p>
                    <a
                      href={`mailto:${CONTACTS.support}`}
                      className="text-sm font-mono text-violet-600 hover:underline block"
                      data-testid="link-email-info"
                    >
                      {CONTACTS.support}
                    </a>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900 to-indigo-950 border border-indigo-700/40 shadow-md p-6 space-y-3" data-testid="card-trinity-contact-quick">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold text-white">Trinity AI — Direct Line</h3>
              </div>
              <p className="text-xs text-indigo-300">
                Trinity answers around the clock — your 24/7 AI co-pilot. She handles staff calls, client questions, employment verifications, sales inquiries, and emergency escalations.
              </p>
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  <a
                    href="tel:+18664644151"
                    className="text-sm font-mono text-white hover:text-amber-300 transition-colors"
                    data-testid="link-trinity-direct-phone"
                  >
                    {import.meta.env.VITE_TRINITY_PHONE || "+1 (866) 464-4151"}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  <a
                    href={`mailto:${CONTACTS.trinity}`}
                    className="text-sm font-mono text-white hover:text-amber-300 transition-colors break-all"
                    data-testid="link-trinity-direct-email"
                  >
                    {CONTACTS.trinity}
                  </a>
                </div>
              </div>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs mt-1">
                Powered by Trinity AI
              </Badge>
            </Card>

            <Card className="bg-card dark:bg-gray-900 border border-border dark:border-gray-700 shadow-md p-6 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-10 w-10 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-violet-600" />
                </div>
                <h3 className="font-semibold text-foreground dark:text-gray-100">Enterprise Inquiries</h3>
              </div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Managing 100+ employees? Contact our team for custom pricing and dedicated onboarding.
              </p>
              <Button
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md"
                onClick={() => window.location.href = `mailto:${CONTACTS.support}`}
                data-testid="button-enterprise-contact"
              >
                Contact Us
              </Button>
            </Card>
          </div>
        </div>
      </section>

      </main>
      {/* Footer */}
      <Footer variant="light" />
    </div>
  );
}
