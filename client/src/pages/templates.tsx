import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useParams } from "wouter";
import { 
  Building2, 
  Calendar, 
  Building, 
  ShoppingCart,
  Warehouse,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  FileText,
  Brain,
} from "lucide-react";

interface SecurityTemplate {
  id: string;
  name: string;
  icon: typeof Building2;
  tagline: string;
  description: string;
  challenges: string[];
  solutions: string[];
  features: string[];
  shifts: { name: string; hours: string; staffing: string }[];
  compliance: string[];
  testimonial?: {
    quote: string;
    author: string;
    company: string;
  };
}

const templates: Record<string, SecurityTemplate> = {
  'hospital': {
    id: 'hospital',
    name: 'Hospital & Healthcare Security',
    icon: Building2,
    tagline: 'Protect patients, staff, and visitors 24/7',
    description: 'Specialized security scheduling for hospitals, clinics, and healthcare facilities with HIPAA-compliant time tracking and incident management.',
    challenges: [
      'Managing 24/7 coverage across multiple departments',
      'Handling emergency response and code alerts',
      'Tracking visitor management and patient safety',
      'Coordinating with nursing staff and administration',
      'Maintaining HIPAA compliance in all reporting',
    ],
    solutions: [
      'Trinity AI optimizes shifts across ER, ICU, and general floors',
      'GPS geofencing ensures guards are at assigned stations',
      'Incident reports integrate with hospital safety systems',
      'Automated break scheduling for 12-hour shifts',
      'HIPAA-compliant audit trails for all activities',
    ],
    features: [
      'Department-based scheduling (ER, ICU, Lobby, Parking)',
      'Code response tracking and drill documentation',
      'Visitor badge management integration',
      'Patient escort logging',
      'Violence prevention incident tracking',
    ],
    shifts: [
      { name: 'Day Shift', hours: '7:00 AM - 7:00 PM', staffing: '8-12 guards' },
      { name: 'Night Shift', hours: '7:00 PM - 7:00 AM', staffing: '6-8 guards' },
      { name: 'ER Coverage', hours: '24/7 dedicated', staffing: '2 guards always' },
    ],
    compliance: [
      'HIPAA patient privacy',
      'Joint Commission standards',
      'CMS security requirements',
      'State healthcare regulations',
    ],
    testimonial: {
      quote: "CoAIleague reduced our scheduling conflicts by 85%. Our guards are always where they need to be.",
      author: "Director of Security",
      company: "Regional Medical Center",
    },
  },
  'warehouse': {
    id: 'warehouse',
    name: 'Warehouse & Distribution Security',
    icon: Warehouse,
    tagline: 'Secure inventory and prevent shrinkage',
    description: 'Loss prevention and access control for warehouses, distribution centers, and logistics facilities with inventory protection protocols.',
    challenges: [
      'Preventing internal and external theft',
      'Managing access across loading docks and gates',
      'Coordinating with shift changes in operations',
      'Tracking vehicle and visitor access',
      'Handling seasonal staffing fluctuations',
    ],
    solutions: [
      'Gate checkpoint scheduling with vehicle logging',
      'Loss prevention patrol routes with GPS verification',
      'Integration with warehouse management systems',
      'Surge staffing for peak seasons',
      'Real-time incident alerts to operations managers',
    ],
    features: [
      'Loading dock coverage scheduling',
      'Gate access control integration',
      'Patrol route verification',
      'Vehicle inspection logging',
      'Inventory shrinkage tracking',
    ],
    shifts: [
      { name: 'Day Operations', hours: '6:00 AM - 2:00 PM', staffing: '4-6 guards' },
      { name: 'Swing Shift', hours: '2:00 PM - 10:00 PM', staffing: '4-6 guards' },
      { name: 'Night Watch', hours: '10:00 PM - 6:00 AM', staffing: '2-3 guards' },
    ],
    compliance: [
      'C-TPAT certification requirements',
      'OSHA workplace safety',
      'FDA facility security (food)',
      'Customs bonded warehouse rules',
    ],
  },
  'event': {
    id: 'event',
    name: 'Event & Venue Security',
    icon: Calendar,
    tagline: 'Safe events from setup to teardown',
    description: 'Flexible security staffing for concerts, sports, conferences, and special events with rapid deployment capabilities.',
    challenges: [
      'Scaling staff for events of varying sizes',
      'Managing crowd control and access points',
      'Coordinating with venue staff and promoters',
      'Handling last-minute schedule changes',
      'Post-event demobilization logistics',
    ],
    solutions: [
      'Event-based scheduling with headcount forecasting',
      'Zone-based assignment management',
      'Real-time communication with all staff',
      'Rapid overtime approval workflows',
      'Post-event reporting and billing automation',
    ],
    features: [
      'Event calendar integration',
      'Zone-based post assignments',
      'Crowd density monitoring',
      'VIP escort scheduling',
      'Incident reporting by location',
    ],
    shifts: [
      { name: 'Setup', hours: 'Event -4 hours', staffing: 'Based on venue size' },
      { name: 'Event Coverage', hours: 'Duration + buffer', staffing: '1:100 attendee ratio' },
      { name: 'Teardown', hours: 'Event +2 hours', staffing: 'Reduced crew' },
    ],
    compliance: [
      'Venue insurance requirements',
      'Local crowd control regulations',
      'Fire marshal capacity limits',
      'ADA accessibility compliance',
    ],
  },
  'corporate': {
    id: 'corporate',
    name: 'Corporate & Office Security',
    icon: Building,
    tagline: 'Professional protection for business environments',
    description: 'Executive protection, lobby security, and access control for corporate campuses, office buildings, and business parks.',
    challenges: [
      'Managing multi-tenant building access',
      'Executive protection scheduling',
      'After-hours building security',
      'Visitor management and badge systems',
      'Integrating with building management',
    ],
    solutions: [
      'Lobby desk coverage optimization',
      'Executive travel security coordination',
      'After-hours patrol scheduling',
      'Visitor pre-registration workflows',
      'Building management system integration',
    ],
    features: [
      'Lobby and reception coverage',
      'Executive protection assignments',
      'Parking garage patrols',
      'Mail room security',
      'Conference room event support',
    ],
    shifts: [
      { name: 'Business Hours', hours: '7:00 AM - 6:00 PM', staffing: '3-5 guards' },
      { name: 'Evening', hours: '6:00 PM - 11:00 PM', staffing: '1-2 guards' },
      { name: 'Overnight', hours: '11:00 PM - 7:00 AM', staffing: '1 guard + patrol' },
    ],
    compliance: [
      'Building fire codes',
      'ADA accessibility',
      'Corporate insurance requirements',
      'Data center security standards',
    ],
  },
  'retail': {
    id: 'retail',
    name: 'Retail & Loss Prevention',
    icon: ShoppingCart,
    tagline: 'Reduce shrinkage, protect customers',
    description: 'Loss prevention officers, store security, and asset protection for retail stores, shopping centers, and malls.',
    challenges: [
      'Reducing shoplifting and organized retail crime',
      'Managing seasonal staffing (holidays)',
      'Coordinating across multiple store locations',
      'Balancing customer service with security',
      'Tracking apprehensions and incidents',
    ],
    solutions: [
      'Store-by-store scheduling optimization',
      'Holiday surge staffing automation',
      'Multi-location visibility and transfers',
      'Incident documentation with photo evidence',
      'Apprehension tracking and analytics',
    ],
    features: [
      'Store floor coverage',
      'Fitting room monitoring',
      'Parking lot patrols',
      'Cash escort scheduling',
      'Shrinkage analytics dashboard',
    ],
    shifts: [
      { name: 'Opening', hours: 'Store open - close', staffing: '1-2 per location' },
      { name: 'Peak Hours', hours: '11 AM - 7 PM', staffing: 'Additional coverage' },
      { name: 'Holiday Season', hours: 'Extended hours', staffing: '2x normal staff' },
    ],
    compliance: [
      'Shopkeeper privilege laws',
      'Detention and arrest procedures',
      'State LP certification',
      'Civil recovery processes',
    ],
  },
  'education': {
    id: 'education',
    name: 'Education & Campus Security',
    icon: GraduationCap,
    tagline: 'Safe learning environments',
    description: 'School resource officers, campus security, and educational facility protection for K-12 schools, colleges, and universities.',
    challenges: [
      'Coordinating with school schedules and events',
      'Managing summer and holiday coverage changes',
      'Handling student and parent interactions',
      'Emergency lockdown procedures',
      'Athletic event security',
    ],
    solutions: [
      'Academic calendar-based scheduling',
      'Athletic event staffing automation',
      'Parent pickup line management',
      'Emergency drill documentation',
      'Student incident tracking',
    ],
    features: [
      'Campus zone assignments',
      'Athletic event coverage',
      'Parking lot monitoring',
      'Visitor check-in procedures',
      'Emergency response coordination',
    ],
    shifts: [
      { name: 'School Hours', hours: '6:30 AM - 4:00 PM', staffing: 'Based on enrollment' },
      { name: 'After School', hours: '4:00 PM - 10:00 PM', staffing: 'Events-based' },
      { name: 'Summer', hours: 'Reduced schedule', staffing: 'Minimal coverage' },
    ],
    compliance: [
      'State school security requirements',
      'Title IX reporting',
      'Active shooter training',
      'FERPA student privacy',
    ],
  },
};

function TemplateCard({ template }: { template: SecurityTemplate }) {
  const Icon = template.icon;
  return (
    <Link href={`/templates/${template.id}`} data-testid={`link-template-${template.id}`}>
      <Card className="h-full hover-elevate cursor-pointer" data-testid={`card-template-${template.id}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <CardDescription>{template.tagline}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
          <div className="flex flex-wrap gap-2">
            {template.features.slice(0, 3).map((feature, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function TemplateDetail({ template }: { template: SecurityTemplate }) {
  const Icon = template.icon;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        <Link href="/templates" data-testid="link-all-templates">
          <Button variant="ghost" size="sm" className="mb-6 text-slate-400" data-testid="button-view-all-templates">
            View All Templates
          </Button>
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 rounded-xl bg-primary/20">
            <Icon className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">{template.name}</h1>
            <p className="text-lg text-slate-300">{template.tagline}</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Industry Challenges
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {template.challenges.map((challenge, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-red-500 mt-1">•</span>
                      <span>{challenge}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  How Trinity AI Solves Them
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {template.solutions.map((solution, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{solution}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Typical Shift Patterns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-4">
                  {template.shifts.map((shift, i) => (
                    <div key={i} className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-semibold mb-2">{shift.name}</h4>
                      <p className="text-sm text-muted-foreground">{shift.hours}</p>
                      <p className="text-sm text-primary mt-1">{shift.staffing}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Compliance Requirements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {template.compliance.map((req, i) => (
                    <Badge key={i} variant="outline">
                      {req}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-primary text-primary-foreground">
              <CardHeader>
                <CardTitle>Start with This Template</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Pre-configured for {template.name.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {template.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/roi-calculator" data-testid={`link-calculate-roi-${template.id}`}>
                  <Button 
                    variant="secondary" 
                    className="w-full"
                    data-testid={`button-calculate-roi-${template.id}`}
                  >
                    Calculate Your ROI
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {template.testimonial && (
              <Card>
                <CardContent className="pt-6">
                  <p className="italic text-muted-foreground mb-4">
                    "{template.testimonial.quote}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {template.testimonial.author.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{template.testimonial.author}</p>
                      <p className="text-sm text-muted-foreground">{template.testimonial.company}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Need Custom Setup?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team can configure CoAIleague specifically for your operation.
                </p>
                <Link href="/contact" data-testid="link-contact-sales">
                  <Button variant="outline" className="w-full" data-testid="button-contact-sales">
                    Talk to Sales
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { templateId } = useParams<{ templateId?: string }>();

  if (templateId && templates[templateId]) {
    return <TemplateDetail template={templates[templateId]} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4 text-primary border-primary/30">
            <Shield className="w-3 h-3 mr-1" />
            Security Industry Templates
          </Badge>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Built for Your Security Vertical
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            Pre-configured scheduling templates, compliance checklists, and shift patterns 
            tailored to your specific security industry.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {Object.values(templates).map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>

        <div className="mt-16 text-center">
          <Card className="inline-block bg-white/5 backdrop-blur border-white/10">
            <CardContent className="pt-6 px-8">
              <h3 className="text-xl font-semibold text-white mb-2">
                Don't see your industry?
              </h3>
              <p className="text-slate-400 mb-4">
                CoAIleague works for any security operation. Let us configure it for you.
              </p>
              <Link href="/roi-calculator" data-testid="link-get-started">
                <Button data-testid="button-get-started">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
