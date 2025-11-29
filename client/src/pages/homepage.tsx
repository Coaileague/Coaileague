import { useEffect } from 'react';
import { 
  Calendar, DollarSign, FileText, Zap, CheckCircle, ArrowRight, 
  Play, Shield, Lock, Activity, Cpu, RefreshCw, MessageSquare, BarChart3
} from 'lucide-react';
import { Link } from 'wouter';
import { UniversalHeader } from '@/components/universal-header';
import { Footer } from '@/components/footer';

export default function Homepage() {
  // Hide the pre-React loading screen on public pages
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
      description: 'Automatically schedules your entire workforce based on availability, skills, labor laws, and demand patterns. Eliminates manual scheduling completely.',
      stats: '75% reduction in scheduling time',
      color: 'blue',
      savings: 'Save 20+ hours per week'
    },
    {
      icon: DollarSign,
      title: 'Autonomous Payroll',
      subtitle: 'Integrates with Gusto & QuickBooks',
      description: 'Syncs time entries, calculates wages, and processes payroll automatically through your existing Gusto or QuickBooks subscription. Zero manual data entry.',
      stats: '100% payroll accuracy',
      color: 'blue',
      savings: 'Cut payroll costs by 60%'
    },
    {
      icon: FileText,
      title: 'Autonomous Invoicing',
      subtitle: 'Smart Client Billing',
      description: 'Automatically generates and sends invoices to your end clients based on completed shifts and services. Tracks payments and sends reminders.',
      stats: '3x faster payment collection',
      color: 'purple',
      savings: 'Eliminate billing delays'
    }
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      {/* Universal Header */}
      <UniversalHeader variant="public" />

      {/* Hero Section - Enhanced */}
      <section className="pt-12 sm:pt-24 pb-12 sm:pb-20 px-3 sm:px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50 relative overflow-hidden mobile-compact-p mobile-text-scale">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10">
          <div className="absolute top-20 right-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-40 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10 px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-center mobile-cols-1 mobile-gap-4">
            {/* Left Column - Content */}
            <div>
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-6 shadow-md">
                <Cpu className="w-4 h-4" />
                CoAIleague AI Brain — Autonomous Workforce Intelligence
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight break-words">
                Replace $100K+ in
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600">
                  Administrative Salaries
                </span>
              </h1>
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-700 mb-6 leading-relaxed">
                Let <strong className="text-gray-900">CoAIleague AI Brain</strong> autonomously handle your scheduling, payroll processing, and client invoicing. 
                <strong className="text-blue-600"> Save hundreds of thousands annually</strong> on HR and admin staff.
              </p>
              
              {/* ROI Calculator Style Box */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-50 border-2 border-blue-200 rounded-xl p-4 sm:p-6 shadow-lg mb-6 sm:mb-8 w-full overflow-x-hidden">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <DollarSign className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600 shrink-0" />
                  <span className="font-bold text-sm sm:text-base text-gray-900 truncate">Typical Annual Savings</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1 break-words">$140K+</div>
                    <div className="text-xs sm:text-sm text-gray-600 break-words">Eliminated salary costs</div>
                    <div className="text-xs text-gray-500 mt-1 break-words">2-3 admin roles at $60K avg</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1 break-words">$50K+</div>
                    <div className="text-xs sm:text-sm text-gray-600 break-words">Reduced overtime waste</div>
                    <div className="text-xs text-gray-500 mt-1 break-words">Smarter scheduling & allocation</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-6 sm:mb-8 mobile-flex-col mobile-gap-3">
                <Link href="/pricing" className="px-4 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-blue-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center sm:justify-start gap-2 text-sm sm:text-base min-h-[44px]" data-testid="button-calculate-savings">
                  Calculate Savings
                  <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5 shrink-0" />
                </Link>
                <Link href="/support" className="px-4 sm:px-8 py-3 sm:py-4 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-50 transition-all border-2 border-gray-200 flex items-center justify-center sm:justify-start gap-2 shadow-md text-sm sm:text-base min-h-[44px]" data-testid="button-see-demo">
                  <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5 shrink-0" />
                  Chat with AI
                </Link>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-gray-200 mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-700"><strong>CoAIleague AI Brain</strong> Powered</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-700"><strong>SOC 2</strong> Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-700"><strong>99.9%</strong> Uptime</span>
                </div>
              </div>
            </div>

            {/* Right Column - Visual Demo */}
            <div className="relative">
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-gradient-to-br from-blue-400 to-blue-400 rounded-full opacity-20 blur-2xl"></div>
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 relative">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-blue-600" />
                    <span className="font-bold text-gray-900">CoAIleague AI Brain</span>
                  </div>
                  <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    Neural Engine Active
                  </div>
                </div>
                
                {/* Mini Schedule Preview */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                      SM
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Tech Support</div>
                        <div className="text-xs opacity-90 mt-1">9AM-5PM</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Field Ops</div>
                        <div className="text-xs opacity-90 mt-1">1PM-9PM</div>
                      </div>
                      <div className="border-2 border-dashed border-gray-300 p-3 rounded-lg bg-gray-50"></div>
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Emergency</div>
                        <div className="text-xs opacity-90 mt-1">12AM-8AM</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                      JD
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Healthcare</div>
                        <div className="text-xs opacity-90 mt-1">8AM-4PM</div>
                      </div>
                      <div className="border-2 border-dashed border-gray-300 p-3 rounded-lg bg-gray-50"></div>
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Training</div>
                        <div className="text-xs opacity-90 mt-1">10AM-2PM</div>
                      </div>
                      <div className="border-2 border-dashed border-gray-300 p-3 rounded-lg bg-gray-50"></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                      MD
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div className="border-2 border-dashed border-gray-300 p-3 rounded-lg bg-gray-50"></div>
                      <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Security</div>
                        <div className="text-xs opacity-90 mt-1">2PM-10PM</div>
                      </div>
                      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-3 rounded-lg shadow-md hover-elevate active-elevate-2 cursor-pointer">
                        <div className="text-xs font-semibold">Admin</div>
                        <div className="text-xs opacity-90 mt-1">9AM-5PM</div>
                      </div>
                      <div className="border-2 border-dashed border-gray-300 p-3 rounded-lg bg-gray-50"></div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-gray-700">AI Generated Schedule</span>
                      </div>
                      <span className="text-xs font-bold text-blue-600">100% Automated</span>
                    </div>
                  </div>
                  <Link href="/support" className="block w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold text-sm hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl" data-testid="button-watch-demo">
                    <MessageSquare className="w-4 h-4" />
                    Experience CoAIleague AI Brain
                  </Link>
                </div>
              </div>

              {/* Floating Stats Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-2xl border-2 border-blue-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">$190K+</div>
                    <div className="text-xs text-gray-500">Avg. Annual Savings</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Autonomous Features - Enhanced */}
      <section id="features" className="py-20 px-6 bg-white mobile-compact-p">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold mb-4 shadow-md">
              <Cpu className="w-4 h-4" />
              Powered by CoAIleague AI Brain — Neural Workforce Engine
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              AI Replaces Your Most Expensive Staff
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-4">
              <strong className="text-gray-900">Fire-and-forget AI systems</strong> that work 24/7 without sick days, vacations, or raises.
            </p>
            <p className="text-lg text-blue-600 font-bold">
              Stop paying $40K-$70K salaries for tasks AI does better
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16 mobile-cols-1 mobile-gap-4">
            {autonomousFeatures.map((feature, idx) => (
              <div key={idx} className="group bg-gradient-to-br from-white to-gray-50 rounded-2xl p-8 border-2 border-gray-200 hover:border-blue-300 hover:shadow-2xl transition-all relative overflow-hidden">
                {/* Decorative gradient */}
                <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 blur-3xl ${
                  feature.color === 'blue' ? 'bg-blue-500' :
                  feature.color === 'green' ? 'bg-blue-500' :
                  'bg-purple-500'
                }`}></div>

                <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-6 shadow-lg ${
                  feature.color === 'blue' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                  feature.color === 'green' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                  'bg-gradient-to-br from-purple-500 to-purple-600'
                }`}>
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-4 h-4 text-purple-600" />
                    <div className="text-xs font-semibold text-purple-600 uppercase tracking-wider">AI-Powered</div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <div className="text-sm text-gray-500 mb-3">{feature.subtitle}</div>
                </div>
                
                <p className="text-gray-600 mb-6 leading-relaxed">{feature.description}</p>
                
                {/* Cost Replacement Highlight */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-bold text-gray-900">Replaces Human Staff</span>
                  </div>
                  <div className="text-xs text-gray-600 mb-1">
                    {idx === 0 && "Eliminates 1-2 scheduling coordinators"}
                    {idx === 1 && "Replaces payroll administrator role"}
                    {idx === 2 && "Removes billing clerk position"}
                  </div>
                  <div className="text-lg font-bold text-blue-600">
                    {idx === 0 && "$50K-$80K saved annually"}
                    {idx === 1 && "$45K-$65K saved annually"}
                    {idx === 2 && "$40K-$60K saved annually"}
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    feature.color === 'blue' ? 'bg-blue-50' :
                    feature.color === 'green' ? 'bg-blue-50' :
                    'bg-purple-50'
                  }`}>
                    <CheckCircle className={`w-5 h-5 ${
                      feature.color === 'blue' ? 'text-blue-600' :
                      feature.color === 'green' ? 'text-blue-600' :
                      'text-purple-600'
                    }`} />
                    <span className="text-sm font-semibold text-gray-700">{feature.savings}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg ${
                    feature.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                    feature.color === 'green' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    <BarChart3 className="w-4 h-4" />
                    {feature.stats}
                  </div>
                </div>

                <Link href="/support" className={`block w-full px-4 py-3 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-xl flex items-center justify-center gap-2 ${
                    feature.color === 'blue' ? 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700' :
                    feature.color === 'green' ? 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700' :
                    'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                  }`} data-testid={`button-demo-${feature.color}`}>
                  Try AI Brain Live
                  <MessageSquare className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>

          {/* Total Savings Calculator */}
          <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-600 rounded-2xl p-12 text-white text-center shadow-2xl">
            <div className="max-w-3xl mx-auto">
              <h3 className="text-3xl md:text-4xl font-bold mb-4">
                Total Administrative Replacement Value
              </h3>
              <p className="text-xl text-blue-100 mb-8">
                These three AI systems replace 3-5 full-time employees
              </p>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-8 border-2 border-white/30">
                <div className="grid md:grid-cols-3 gap-6 mb-6 mobile-cols-1 mobile-gap-3">
                  <div>
                    <div className="text-5xl font-bold mb-2">$155K+</div>
                    <div className="text-blue-100">Eliminated Salaries</div>
                  </div>
                  <div>
                    <div className="text-5xl font-bold mb-2">$35K+</div>
                    <div className="text-blue-100">Benefits Saved</div>
                  </div>
                  <div>
                    <div className="text-5xl font-bold mb-2">$190K+</div>
                    <div className="text-blue-100">Total Annual Savings</div>
                  </div>
                </div>
                <div className="text-sm text-blue-100 italic">
                  * Based on replacing scheduler ($65K), payroll administrator ($58K), and billing specialist ($52K) + 25% benefits
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer variant="dark" />
    </div>
  );
}
