import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { 
  CheckCircle2, 
  XCircle, 
  Minus,
  Brain, 
  Shield, 
  Clock, 
  DollarSign,
  Zap,
  Users,
  BarChart3,
  Globe,
  ArrowRight,
} from "lucide-react";

interface ComparisonFeature {
  name: string;
  category: string;
  coaileague: 'yes' | 'no' | 'partial';
  competitor: 'yes' | 'no' | 'partial';
  coaileagueNote?: string;
  competitorNote?: string;
}

interface Competitor {
  name: string;
  slug: string;
  description: string;
  features: ComparisonFeature[];
  pricing: {
    coaileague: string;
    competitor: string;
  };
}

const competitors: Record<string, Competitor> = {
  'deputy': {
    name: 'Deputy',
    slug: 'deputy',
    description: 'Deputy is a workforce management platform focused on scheduling and time tracking.',
    pricing: {
      coaileague: 'From $499/mo (15 users included)',
      competitor: '$4.50/user/mo (scheduling only)',
    },
    features: [
      { name: 'AI-Powered Scheduling', category: 'Scheduling', coaileague: 'yes', competitor: 'partial', coaileagueNote: 'Trinity AI optimizes for profit & compliance', competitorNote: 'Basic auto-fill only' },
      { name: 'GPS Geofenced Time Tracking', category: 'Time Tracking', coaileague: 'yes', competitor: 'yes' },
      { name: '50-State Labor Compliance', category: 'Compliance', coaileague: 'yes', competitor: 'partial', competitorNote: 'Limited states' },
      { name: 'Automated Break Scheduling', category: 'Compliance', coaileague: 'yes', competitor: 'no' },
      { name: 'Client Billing & Invoicing', category: 'Billing', coaileague: 'yes', competitor: 'no' },
      { name: 'QuickBooks Integration', category: 'Integrations', coaileague: 'yes', competitor: 'yes' },
      { name: 'Employee Scoring System', category: 'Analytics', coaileague: 'yes', competitor: 'no', coaileagueNote: '0-100 composite scoring' },
      { name: 'Client Tiering & Profit Optimization', category: 'Analytics', coaileague: 'yes', competitor: 'no' },
      { name: 'Incident Management', category: 'Operations', coaileague: 'yes', competitor: 'no' },
      { name: 'WhatsApp/SMS Notifications', category: 'Communications', coaileague: 'yes', competitor: 'partial' },
      { name: 'Mobile App', category: 'Access', coaileague: 'yes', competitor: 'yes' },
      { name: 'AI Chatbot Support', category: 'Support', coaileague: 'yes', competitor: 'no', coaileagueNote: 'Trinity AI 24/7' },
    ],
  },
  'wheniwork': {
    name: 'When I Work',
    slug: 'wheniwork',
    description: 'When I Work is a scheduling and time tracking app for shift-based businesses.',
    pricing: {
      coaileague: 'From $499/mo (15 users included)',
      competitor: '$2.50/user/mo (scheduling only)',
    },
    features: [
      { name: 'AI-Powered Scheduling', category: 'Scheduling', coaileague: 'yes', competitor: 'no' },
      { name: 'GPS Geofenced Time Tracking', category: 'Time Tracking', coaileague: 'yes', competitor: 'yes' },
      { name: '50-State Labor Compliance', category: 'Compliance', coaileague: 'yes', competitor: 'no' },
      { name: 'Automated Break Scheduling', category: 'Compliance', coaileague: 'yes', competitor: 'no' },
      { name: 'Client Billing & Invoicing', category: 'Billing', coaileague: 'yes', competitor: 'no' },
      { name: 'QuickBooks Integration', category: 'Integrations', coaileague: 'yes', competitor: 'partial' },
      { name: 'Employee Scoring System', category: 'Analytics', coaileague: 'yes', competitor: 'no' },
      { name: 'Incident Management', category: 'Operations', coaileague: 'yes', competitor: 'no' },
      { name: 'WhatsApp/SMS Notifications', category: 'Communications', coaileague: 'yes', competitor: 'yes' },
      { name: 'Mobile App', category: 'Access', coaileague: 'yes', competitor: 'yes' },
    ],
  },
  'trackforce': {
    name: 'Trackforce Valiant',
    slug: 'trackforce',
    description: 'Trackforce Valiant is a security workforce management system.',
    pricing: {
      coaileague: 'From $499/mo (15 users included)',
      competitor: 'Custom pricing (typically $8-15/user)',
    },
    features: [
      { name: 'AI-Powered Scheduling', category: 'Scheduling', coaileague: 'yes', competitor: 'partial' },
      { name: 'GPS Geofenced Time Tracking', category: 'Time Tracking', coaileague: 'yes', competitor: 'yes' },
      { name: '50-State Labor Compliance', category: 'Compliance', coaileague: 'yes', competitor: 'yes' },
      { name: 'Guard Tour Tracking', category: 'Security', coaileague: 'yes', competitor: 'yes' },
      { name: 'Incident Management', category: 'Operations', coaileague: 'yes', competitor: 'yes' },
      { name: 'Client Portal', category: 'Client Experience', coaileague: 'yes', competitor: 'yes' },
      { name: 'Automated Payroll Processing', category: 'Payroll', coaileague: 'yes', competitor: 'partial' },
      { name: 'QuickBooks Integration', category: 'Integrations', coaileague: 'yes', competitor: 'partial' },
      { name: 'AI Business Intelligence', category: 'Analytics', coaileague: 'yes', competitor: 'no', coaileagueNote: 'Trinity AI insights' },
      { name: 'Employee Scoring System', category: 'Analytics', coaileague: 'yes', competitor: 'no' },
    ],
  },
};

function FeatureIcon({ status }: { status: 'yes' | 'no' | 'partial' }) {
  if (status === 'yes') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  if (status === 'no') return <XCircle className="w-5 h-5 text-red-500" />;
  return <Minus className="w-5 h-5 text-yellow-500" />;
}

export default function ComparePage() {
  const { competitor: competitorSlug } = useParams<{ competitor?: string }>();
  
  const testimonialsQuery = useQuery({
    queryKey: ['/api/testimonials/public'],
  });

  if (!competitorSlug) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30">
              <Brain className="w-3 h-3 mr-1" />
              AI-Powered Comparison
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
              CoAIleague vs Competitors
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              See how CoAIleague's AI-powered workforce management stacks up against the competition.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {Object.values(competitors).map((comp) => (
              <Link key={comp.slug} href={`/compare/${comp.slug}`}>
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle>CoAIleague vs {comp.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{comp.description}</p>
                    <Button variant="outline" size="sm" className="w-full" data-testid={`button-compare-${comp.slug}`}>
                      Compare Features
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const competitor = competitors[competitorSlug];
  
  if (!competitor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-bold mb-2">Competitor not found</h2>
            <p className="text-muted-foreground mb-4">We don't have comparison data for this competitor yet.</p>
            <Link href="/compare">
              <Button>View All Comparisons</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categories = [...new Set(competitor.features.map(f => f.category))];
  const coaileagueWins = competitor.features.filter(f => f.coaileague === 'yes' && f.competitor !== 'yes').length;

  const testimonials = (testimonialsQuery.data || []) as { userName: string; companyName: string; quote: string; title?: string }[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <Link href="/compare">
            <Button variant="ghost" size="sm" className="mb-4 text-slate-400">
              View All Comparisons
            </Button>
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            CoAIleague vs {competitor.name}
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            {competitor.description} See how they compare to CoAIleague's AI-powered platform.
          </p>
          <div className="mt-6">
            <Badge className="bg-green-600 text-white text-lg px-4 py-2">
              CoAIleague leads in {coaileagueWins} features
            </Badge>
          </div>
        </div>

        <Card className="max-w-4xl mx-auto mb-8">
          <CardHeader className="bg-muted/50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div></div>
              <div>
                <Badge className="bg-primary text-primary-foreground">CoAIleague</Badge>
              </div>
              <div>
                <Badge variant="outline">{competitor.name}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {categories.map((category, catIdx) => (
              <div key={category}>
                <div className="bg-muted/30 px-4 py-2 font-semibold text-sm">{category}</div>
                {competitor.features
                  .filter(f => f.category === category)
                  .map((feature, idx) => (
                    <div 
                      key={feature.name} 
                      className={`grid grid-cols-3 gap-4 px-4 py-3 items-center ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                    >
                      <div className="text-sm">{feature.name}</div>
                      <div className="text-center flex flex-col items-center gap-1">
                        <FeatureIcon status={feature.coaileague} />
                        {feature.coaileagueNote && (
                          <span className="text-xs text-muted-foreground">{feature.coaileagueNote}</span>
                        )}
                      </div>
                      <div className="text-center flex flex-col items-center gap-1">
                        <FeatureIcon status={feature.competitor} />
                        {feature.competitorNote && (
                          <span className="text-xs text-muted-foreground">{feature.competitorNote}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
            
            <Separator />
            
            <div className="grid grid-cols-3 gap-4 px-4 py-4 bg-primary/5">
              <div className="font-semibold">Pricing</div>
              <div className="text-center text-sm font-medium text-primary">{competitor.pricing.coaileague}</div>
              <div className="text-center text-sm text-muted-foreground">{competitor.pricing.competitor}</div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mb-12">
          <Link href="/roi-calculator">
            <Button size="lg" data-testid="button-calculate-savings">
              Calculate Your Savings
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        {testimonials.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-white text-center mb-8">What Our Customers Say</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {testimonials.slice(0, 2).map((t, i) => (
                <Card key={i} className="bg-white/5 backdrop-blur border-white/10">
                  <CardContent className="pt-6">
                    <p className="text-slate-300 italic mb-4">"{t.quote}"</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {t.userName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{t.userName}</p>
                        <p className="text-sm text-slate-400">{t.title} at {t.companyName}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="mt-16 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Why Security Companies Switch to CoAIleague</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-white/5 backdrop-blur border-white/10">
              <CardContent className="pt-6 text-center">
                <Brain className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">AI-First Design</h3>
                <p className="text-sm text-slate-400">
                  Trinity AI handles scheduling, compliance, and insights automatically.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 backdrop-blur border-white/10">
              <CardContent className="pt-6 text-center">
                <DollarSign className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Profit Optimization</h3>
                <p className="text-sm text-slate-400">
                  Client tiering and employee scoring maximize your margins.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 backdrop-blur border-white/10">
              <CardContent className="pt-6 text-center">
                <Shield className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">50-State Compliance</h3>
                <p className="text-sm text-slate-400">
                  Never worry about break laws or labor regulations again.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
