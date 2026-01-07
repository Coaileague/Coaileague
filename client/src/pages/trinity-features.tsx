import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Helmet } from 'react-helmet-async';
import { 
  Brain, Zap, Heart, Shield, Clock, Target, TrendingUp, Users, 
  MessageSquare, CheckCircle, ArrowRight, Sparkles, Eye, Bot,
  Calendar, DollarSign, FileText, Bell, Settings, BarChart3
} from 'lucide-react';
import { UniversalHeader } from '@/components/universal-header';
import { Footer } from '@/components/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import TrinityMarketingHero, { TrinitySpotlight } from '@/components/trinity-marketing-hero';

export default function TrinityFeatures() {
  const features = [
    {
      icon: Eye,
      title: 'Context-Aware Intelligence',
      headline: 'Trinity Knows What You\'re Working On',
      description: 'Trinity doesn\'t just wait for questions. She understands what page you\'re on, what data you\'re viewing, and what challenges you\'re facing. Working on next week\'s schedule? Trinity notices open shifts and offers to fill them optimally. Reviewing payroll? She flags overtime issues before they become problems.',
      benefits: [
        'Proactive suggestions based on your current context',
        'Automatic issue detection and recommendations',
        'No need to explain what you\'re doing - Trinity already knows'
      ],
      color: 'cyan'
    },
    {
      icon: BarChart3,
      title: 'Business Optimization',
      headline: 'Data-Driven Insights That Actually Help',
      description: 'Trinity has access to your complete business data: employee schedules, client contracts, time tracking with GPS, payroll costs, overtime trends, and QuickBooks financials. She doesn\'t just show you numbers—she tells you what they MEAN and what to DO about them.',
      benefits: [
        'Ask "Why is my profit down?" and get actionable answers',
        'Real-time financial health monitoring',
        'Proactive alerts before small issues become big problems'
      ],
      color: 'teal'
    },
    {
      icon: Zap,
      title: 'Intelligent Automation',
      headline: 'Trinity Doesn\'t Just Advise—She Acts',
      description: 'With your approval, Trinity can execute tasks on your behalf: auto-fill open shifts based on availability and certifications, send payment reminders to overdue clients, flag overtime violations, sync QuickBooks data, and notify employees of schedule changes.',
      benefits: [
        'Execute actions with a single approval',
        'High-risk actions require confirmation for safety',
        'Save hours every week on repetitive tasks'
      ],
      color: 'blue'
    },
    {
      icon: Heart,
      title: 'Personal Growth & Accountability',
      headline: 'We Care About YOU, Not Just Your Business',
      description: 'Enable Personal Mode and Trinity becomes BUDDY—your accountability partner who challenges you to become a better leader, holds you accountable to commitments, and provides honest feedback even when uncomfortable. Optional spiritual guidance (Christian, general, or none) supports your whole self.',
      benefits: [
        'Personal development coaching tailored to you',
        'Accountability that actually works',
        'Business success starts with personal growth'
      ],
      color: 'purple'
    },
    {
      icon: Brain,
      title: 'Holistic Insights',
      headline: 'Trinity Sees What You Can\'t',
      description: 'Trinity\'s Integrated Mode connects business performance to personal patterns. She might notice your employee turnover spiked when you started working 80-hour weeks, or your profit dropped when you stopped holding team meetings. Business problems are often leadership problems in disguise.',
      benefits: [
        'Connect personal habits to business outcomes',
        'Pattern recognition across all your data',
        'Insights no other platform offers'
      ],
      color: 'amber'
    },
    {
      icon: Clock,
      title: 'Always Available',
      headline: '24/7 Support When You Need It',
      description: '3 AM and can\'t sleep because you\'re worried about payroll? Trinity\'s there. Stuck on a tough decision? Trinity helps you think it through. Unlike robotic AI assistants, Trinity feels like a real partner who knows you and remembers your history.',
      benefits: [
        'Available any time, any device',
        'Remembers your preferences and history',
        'Genuinely cares about your success'
      ],
      color: 'green'
    }
  ];

  const comparisonData = [
    { feature: 'AI-Powered Scheduling', coaileague: true, whenIWork: false, deputy: false, gusto: false },
    { feature: 'Context-Aware Assistant', coaileague: true, whenIWork: false, deputy: false, gusto: false },
    { feature: 'QuickBooks Deep Integration', coaileague: true, whenIWork: 'Basic', deputy: 'Basic', gusto: true },
    { feature: 'Personal Development Coaching', coaileague: true, whenIWork: false, deputy: false, gusto: false },
    { feature: 'Proactive Business Insights', coaileague: true, whenIWork: false, deputy: false, gusto: false },
    { feature: 'Intelligent Automation', coaileague: true, whenIWork: false, deputy: false, gusto: false },
    { feature: 'Actually Cares About Your Growth', coaileague: true, whenIWork: false, deputy: false, gusto: false },
  ];

  const testimonials = [
    {
      quote: "Trinity noticed I was scheduling too many overtime shifts and suggested hiring one more guard. I did, and my labor costs dropped 12% in one month. She paid for herself immediately.",
      author: "Security Company Owner",
      role: "Beta Customer"
    },
    {
      quote: "I was skeptical about Personal Mode at first. But Trinity called me out on avoiding a difficult conversation with an underperforming manager. She was right. My entire team improved.",
      author: "Operations Manager",
      role: "Beta Customer"
    },
    {
      quote: "I've used When I Work, Deputy, and Homebase. Trinity is in a different league. She doesn't just track time—she thinks WITH me about how to grow my business.",
      author: "CEO",
      role: "Beta Customer"
    }
  ];

  return (
    <>
      <Helmet>
        <title>Trinity AI Assistant - Your Always-On Business Partner | CoAIleague</title>
        <meta name="description" content="Meet Trinity: The only workforce management AI that understands your business, supports your growth, and actually cares about your success. Context-aware, always available, truly intelligent." />
      </Helmet>

      <div className="min-h-screen bg-white dark:bg-slate-950">
        <UniversalHeader variant="public" />

        {/* Hero Section */}
        <section className="pt-20 pb-16 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-20 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
          </div>

          <div className="max-w-5xl mx-auto text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex justify-center mb-6">
                <TrinityMarketingHero variant="hero" iconOnly showGlow showSparkles />
              </div>

              <Badge className="mb-4 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
                <Sparkles className="w-3 h-3 mr-1" />
                Included Free with Every Plan
              </Badge>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight">
                Meet Trinity: Your AI Partner for{' '}
                <span className="bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
                  Business, Leadership & Life
                </span>
              </h1>

              <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
                The only workforce management platform with an AI assistant that understands your business challenges, supports your personal growth, and{' '}
                <span className="font-semibold text-slate-800 dark:text-white">actually cares about your success.</span>
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700" asChild>
                  <Link href="/register" data-testid="button-start-trial">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/support" data-testid="button-see-demo">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    See Trinity in Action
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Core Value Proposition */}
        <section className="py-16 px-4 sm:px-6 bg-slate-900 text-white">
          <div className="max-w-5xl mx-auto">
            <TrinitySpotlight
              title="What Makes Trinity Different"
              message="Most workforce management platforms help you schedule shifts and process payroll. Trinity does that—and so much more. She's an AI assistant who knows your business inside and out, understands what you're working on, and proactively helps you succeed."
            />
            
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              <div className="text-center p-6">
                <div className="text-4xl font-bold text-cyan-400 mb-2">24/7</div>
                <div className="text-slate-300">Always Available</div>
              </div>
              <div className="text-center p-6">
                <div className="text-4xl font-bold text-cyan-400 mb-2">100%</div>
                <div className="text-slate-300">Context Aware</div>
              </div>
              <div className="text-center p-6">
                <div className="text-4xl font-bold text-cyan-400 mb-2">$0</div>
                <div className="text-slate-300">Extra Cost</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Deep Dive */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                Everything Trinity Can Do For You
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                From intelligent automation to personal growth coaching, Trinity is your complete AI partner.
              </p>
            </div>

            <div className="space-y-16">
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  className={`flex flex-col ${idx % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-8 lg:gap-12 items-center`}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="flex-1">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                      feature.color === 'cyan' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' :
                      feature.color === 'teal' ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' :
                      feature.color === 'blue' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                      feature.color === 'purple' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                      feature.color === 'amber' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <Badge variant="outline" className="mb-3">{feature.title}</Badge>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      {feature.headline}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.benefits.map((benefit, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700 dark:text-slate-300">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1 w-full">
                    <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-slate-200 dark:border-slate-700">
                      <CardContent className="p-8 flex items-center justify-center min-h-[250px]">
                        <feature.icon className={`w-24 h-24 opacity-20 ${
                          feature.color === 'cyan' ? 'text-cyan-500' :
                          feature.color === 'teal' ? 'text-teal-500' :
                          feature.color === 'blue' ? 'text-blue-500' :
                          feature.color === 'purple' ? 'text-purple-500' :
                          feature.color === 'amber' ? 'text-amber-500' :
                          'text-green-500'
                        }`} />
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                How Trinity Compares to Other Platforms
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                See why businesses choose CoAIleague over the competition.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left p-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                    <th className="text-center p-4 font-semibold text-cyan-600 dark:text-cyan-400">CoAIleague + Trinity</th>
                    <th className="text-center p-4 font-medium text-slate-500">When I Work</th>
                    <th className="text-center p-4 font-medium text-slate-500">Deputy</th>
                    <th className="text-center p-4 font-medium text-slate-500">Gusto</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                      <td className="p-4 text-slate-700 dark:text-slate-300">{row.feature}</td>
                      <td className="text-center p-4">
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      </td>
                      <td className="text-center p-4 text-slate-400">
                        {row.whenIWork === true ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : 
                         row.whenIWork === 'Basic' ? <span className="text-xs">Basic</span> : '—'}
                      </td>
                      <td className="text-center p-4 text-slate-400">
                        {row.deputy === true ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : 
                         row.deputy === 'Basic' ? <span className="text-xs">Basic</span> : '—'}
                      </td>
                      <td className="text-center p-4 text-slate-400">
                        {row.gusto === true ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                What Our Customers Say
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, idx) => (
                <Card key={idx} className="bg-white dark:bg-slate-800">
                  <CardContent className="p-6">
                    <div className="flex gap-1 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Sparkles key={i} className="w-4 h-4 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mb-4 italic">
                      "{testimonial.quote}"
                    </p>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{testimonial.author}</div>
                      <div className="text-sm text-slate-500">{testimonial.role}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Callout */}
        <section className="py-20 px-4 sm:px-6 bg-gradient-to-r from-cyan-600 to-blue-600">
          <div className="max-w-4xl mx-auto text-center text-white">
            <div className="flex justify-center mb-6">
              <TrinityMarketingHero variant="standard" iconOnly showGlow={false} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Trinity AI Assistant — Included Free
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Other platforms charge $50-100/month for basic AI features. Trinity is included FREE with your CoAIleague subscription.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-cyan-600 hover:bg-slate-100" asChild>
                <Link href="/pricing" data-testid="button-view-pricing">
                  View Pricing
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" asChild>
                <Link href="/register" data-testid="button-start-free">
                  Start Free Trial
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
