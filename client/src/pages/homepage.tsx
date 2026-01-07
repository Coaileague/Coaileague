import { useEffect } from 'react';
import { 
  Calendar, DollarSign, FileText, Zap, CheckCircle, ArrowRight, 
  Play, Shield, Lock, Activity, Cpu, RefreshCw, MessageSquare, BarChart3
} from 'lucide-react';
import { Link } from 'wouter';
import { UniversalHeader } from '@/components/universal-header';
import { Footer } from '@/components/footer';
import { FTCDisclaimer } from '@/components/ftc-disclaimer';

export default function Homepage() {
  useEffect(() => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.style.display = 'none';
      loader.style.visibility = 'hidden';
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
    }
  }, []);

  const autonomousFeatures = [
    {
      icon: Calendar,
      title: 'Autonomous Scheduling',
      subtitle: 'AI-Powered Staffing',
      description: 'Automates workforce scheduling based on availability, skills, labor laws, and demand patterns.',
      stats: 'Up to 75% reduction in scheduling time',
      color: 'teal',
      savings: 'Save up to 20+ hours per week'
    },
    {
      icon: DollarSign,
      title: 'Autonomous Payroll',
      subtitle: 'Integrates with Gusto & QuickBooks',
      description: 'Syncs time entries, calculates wages, and processes payroll automatically through your existing systems.',
      stats: 'High-accuracy payroll sync',
      color: 'cyan',
      savings: 'Reduce payroll processing time'
    },
    {
      icon: FileText,
      title: 'Autonomous Invoicing',
      subtitle: 'Smart Client Billing',
      description: 'Automatically generates and sends invoices based on completed shifts. Tracks payments and sends reminders.',
      stats: 'Faster payment collection',
      color: 'blue',
      savings: 'Reduce billing delays'
    }
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden w-full">
      <UniversalHeader variant="public" />

      {/* Hero Section - Fortune 500 Clean Design */}
      <section className="pt-16 md:pt-24 pb-16 md:pb-20 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-5 hidden md:block">
          <div className="absolute top-32 right-32 w-96 h-96 bg-teal-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column */}
            <div>
              <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-xs font-medium mb-6 border border-slate-200">
                <Cpu className="w-3.5 h-3.5 text-teal-600" />
                <span>Powered by Trinity AI</span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 mb-5 leading-tight tracking-tight">
                Automate Up to $100K+ in
                <br />
                <span className="text-teal-600">Admin Workloads</span>
              </h1>
              
              <p className="text-base md:text-lg text-slate-600 mb-8 leading-relaxed max-w-lg">
                Let Trinity autonomously handle your scheduling, payroll processing, and client invoicing. 
                <span className="text-slate-800 font-medium"> Reduce administrative overhead significantly.</span>
              </p>
              
              {/* Refined Stats Box */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 mb-8 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-teal-600" />
                  <span className="text-sm font-medium text-slate-700">Typical Annual Savings</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-2xl font-semibold text-slate-900 mb-0.5">Up to $140K</div>
                    <div className="text-xs text-slate-500">Potential labor cost reduction*</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-slate-900 mb-0.5">Up to $50K</div>
                    <div className="text-xs text-slate-500">Reduced overtime costs*</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <Link href="/pricing" className="px-6 py-2.5 bg-teal-600 text-white rounded-md font-medium hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 text-sm" data-testid="button-calculate-savings">
                  Calculate Savings
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/support" className="px-6 py-2.5 bg-white text-slate-700 rounded-md font-medium hover:bg-slate-50 transition-colors border border-slate-200 flex items-center justify-center gap-2 text-sm" data-testid="button-see-demo">
                  <MessageSquare className="w-4 h-4" />
                  Chat with AI
                </Link>
              </div>

              {/* Trust Indicators - Minimal */}
              <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500">Powered by Trinity</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500">SOC 2 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500">99.9% Uptime</span>
                </div>
              </div>
            </div>

            {/* Right Column - Refined Demo Card */}
            <div className="relative hidden lg:block">
              <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-5 relative">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-teal-600" />
                    <span className="text-sm font-medium text-slate-800">Powered by Trinity</span>
                  </div>
                  <div className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
                    Active
                  </div>
                </div>
                
                {/* Mini Schedule - Clean Grid */}
                <div className="space-y-2">
                  {[
                    { initials: 'SM', shifts: [{ name: 'Tech Support', time: '9AM-5PM', color: 'bg-teal-500' }, { name: 'Field Ops', time: '1PM-9PM', color: 'bg-cyan-500' }] },
                    { initials: 'JD', shifts: [{ name: 'Healthcare', time: '8AM-4PM', color: 'bg-teal-500' }, { name: 'Training', time: '10AM-2PM', color: 'bg-blue-500' }] },
                    { initials: 'MD', shifts: [{ name: 'Security', time: '2PM-10PM', color: 'bg-cyan-500' }, { name: 'Admin', time: '9AM-5PM', color: 'bg-slate-600' }] },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-slate-100 rounded-md flex items-center justify-center text-slate-600 text-xs font-semibold shrink-0">
                        {row.initials}
                      </div>
                      <div className="flex-1 grid grid-cols-4 gap-1.5">
                        {row.shifts.map((shift, j) => (
                          <div key={j} className={`${shift.color} text-white px-2 py-1.5 rounded text-[10px]`}>
                            <div className="font-medium truncate">{shift.name}</div>
                            <div className="opacity-80">{shift.time}</div>
                          </div>
                        ))}
                        <div className="border border-dashed border-slate-200 rounded bg-slate-50 col-span-2"></div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="bg-slate-50 border border-slate-200 rounded p-2.5 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-teal-600" />
                        <span className="text-xs font-medium text-slate-600">AI Generated Schedule</span>
                      </div>
                      <span className="text-[10px] font-medium text-teal-600">100% Automated</span>
                    </div>
                  </div>
                  <Link href="/support" className="block w-full px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors text-center" data-testid="button-watch-demo">
                    Experience Trinity Intelligence
                  </Link>
                </div>
              </div>

              {/* Floating Badge - Refined */}
              <div className="absolute -bottom-4 -left-4 bg-white rounded-md shadow-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-md flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Up to $190K</div>
                    <div className="text-[10px] text-slate-500">Potential Annual Savings*</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Fortune 500 Refined */}
      <section id="features" className="py-16 md:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-xs font-medium mb-4 border border-slate-200">
              <Cpu className="w-3.5 h-3.5 text-teal-600" />
              Powered by Trinity Neural Engine
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-4 tracking-tight">
              AI Automates Your Most Time-Consuming Tasks
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Always-on automation that works 24/7, handling repetitive administrative work so your team can focus on higher-value activities.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {autonomousFeatures.map((feature, idx) => (
              <div key={idx} className="bg-white rounded-lg border border-slate-200 p-5 hover:border-slate-300 hover:shadow-md transition-all">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center mb-4 ${
                  feature.color === 'teal' ? 'bg-teal-50 text-teal-600' :
                  feature.color === 'cyan' ? 'bg-cyan-50 text-cyan-600' :
                  'bg-blue-50 text-blue-600'
                }`}>
                  <feature.icon className="w-5 h-5" />
                </div>
                
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cpu className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">AI-Powered</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">{feature.title}</h3>
                  <p className="text-xs text-slate-500">{feature.subtitle}</p>
                </div>
                
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">{feature.description}</p>
                
                {/* Savings Highlight - Minimal */}
                <div className="bg-slate-50 border border-slate-100 rounded-md p-3 mb-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-xs font-medium text-slate-700">Automates Administrative Work</span>
                  </div>
                  <div className="text-sm font-semibold text-teal-600">
                    {idx === 0 && "Up to $50K-$80K potential savings*"}
                    {idx === 1 && "Up to $45K-$65K potential savings*"}
                    {idx === 2 && "Up to $40K-$60K potential savings*"}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <CheckCircle className="w-3.5 h-3.5 text-teal-500" />
                    <span>{feature.savings}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <BarChart3 className="w-3.5 h-3.5 text-teal-500" />
                    <span>{feature.stats}</span>
                  </div>
                </div>

                <Link href="/support" className="block w-full px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors text-center" data-testid={`button-demo-${feature.color}`}>
                  Experience Trinity Live
                </Link>
              </div>
            ))}
          </div>

          {/* Total Savings - Refined Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg p-8 md:p-10 text-white">
            <div className="max-w-4xl mx-auto text-center">
              <h3 className="text-xl md:text-2xl font-semibold mb-2">
                Potential Administrative Cost Reduction
              </h3>
              <p className="text-slate-400 text-sm mb-6">
                Automate work equivalent to 3-5 full-time administrative roles*
              </p>
              <div className="grid grid-cols-3 gap-4 md:gap-8 mb-6">
                <div>
                  <div className="text-2xl md:text-3xl font-semibold mb-1">Up to $155K</div>
                  <div className="text-xs text-slate-400">Potential Labor Savings</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-semibold mb-1">Up to $35K</div>
                  <div className="text-xs text-slate-400">Overhead Reduction</div>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-semibold text-teal-400 mb-1">Up to $190K</div>
                  <div className="text-xs text-slate-400">Total Potential Savings</div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 max-w-2xl mx-auto">
                * Estimates based on U.S. Bureau of Labor Statistics median wages: scheduler ($65K), payroll administrator ($58K), billing specialist ($52K) + 25% benefits. Actual results vary by organization size, industry, and implementation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <FTCDisclaimer />
      <Footer variant="dark" />
    </div>
  );
}
