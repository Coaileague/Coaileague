import { useState } from 'react';
import { 
  Calendar, DollarSign, FileText, Zap, CheckCircle, ArrowRight, 
  Play, Shield, Lock, Activity, Menu, X, Cpu, RefreshCw, MessageSquare, BarChart3
} from 'lucide-react';
import { Link } from 'wouter';

export default function Homepage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="min-h-screen bg-white">
      {/* Compact Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 cursor-pointer" data-testid="nav-logo">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-lg">
                  <span className="text-gray-900">AUTO</span>
                  <span className="text-blue-600">FORCE</span>
                  <span className="text-xs align-super text-gray-600">™</span>
                </div>
                <div className="text-xs text-gray-500">Autonomous Workforce Management</div>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium" data-testid="nav-link-features">Features</a>
              <Link href="/pricing" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium" data-testid="nav-link-pricing">Pricing</Link>
              <Link href="/contact" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium" data-testid="nav-link-contact">Contact</Link>
              <Link href="/login" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium" data-testid="nav-link-login">Login</Link>
              <Link href="/register" className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md text-sm" data-testid="nav-button-start-trial">
                Start Free Trial
              </Link>
            </div>

            <button className="md:hidden text-gray-900 hover:text-blue-600 transition-colors" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} data-testid="button-mobile-menu">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 border-t border-gray-200 pt-4" data-testid="mobile-menu">
              <div className="flex flex-col gap-3">
                <a href="#features" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium py-2" data-testid="mobile-link-features">Features</a>
                <Link href="/pricing" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium py-2" data-testid="mobile-link-pricing">Pricing</Link>
                <Link href="/contact" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium py-2" data-testid="mobile-link-contact">Contact</Link>
                <Link href="/login" className="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium py-2" data-testid="mobile-link-login">Login</Link>
                <Link href="/register" className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md text-sm text-center" data-testid="mobile-button-start-trial">
                  Start Free Trial
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section - Enhanced */}
      <section className="pt-24 pb-20 px-6 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-50 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10">
          <div className="absolute top-20 right-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-40 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div>
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-100 to-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-6 shadow-md">
                <Zap className="w-4 h-4" />
                AI-Powered Workforce Automation
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Replace $100K+ in
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600">
                  Administrative Salaries
                </span>
              </h1>
              <p className="text-xl text-gray-700 mb-6 leading-relaxed">
                Let <strong className="text-gray-900">finely-trained AI logic</strong> handle your scheduling, payroll processing, and client invoicing. 
                <strong className="text-blue-600"> Save hundreds of thousands annually</strong> on HR and admin staff.
              </p>
              
              {/* ROI Calculator Style Box */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-50 border-2 border-blue-200 rounded-xl p-6 shadow-lg mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-gray-900">Typical Annual Savings</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-3xl font-bold text-blue-600 mb-1">$120K+</div>
                    <div className="text-sm text-gray-600">Eliminated salary costs</div>
                    <div className="text-xs text-gray-500 mt-1">2-3 admin positions replaced</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-blue-600 mb-1">$48K+</div>
                    <div className="text-sm text-gray-600">Reduced overtime waste</div>
                    <div className="text-xs text-gray-500 mt-1">Optimized scheduling</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-8">
                <Link href="/pricing" className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2" data-testid="button-calculate-savings">
                  Calculate Your Savings
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/register" className="px-8 py-4 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-50 transition-all border-2 border-gray-200 flex items-center gap-2 shadow-md" data-testid="button-see-demo">
                  <Play className="w-5 h-5" />
                  See AI in Action
                </Link>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-700"><strong>AI-Powered</strong> Automation</span>
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
                    <span className="font-bold text-gray-900">AI Workforce Engine</span>
                  </div>
                  <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    AI Running
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
                  <Link href="/register" className="block w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold text-sm hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl" data-testid="button-watch-demo">
                    <Play className="w-4 h-4" />
                    Watch AI Demo
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
                    <div className="text-2xl font-bold text-blue-600">$168K</div>
                    <div className="text-xs text-gray-500">Avg. Annual Savings</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Autonomous Features - Enhanced */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold mb-4 shadow-md">
              <Cpu className="w-4 h-4" />
              Powered by Advanced AI Logic
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

          <div className="grid md:grid-cols-3 gap-8 mb-16">
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

                <Link href="/register" className={`block w-full px-4 py-3 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-xl flex items-center justify-center gap-2 ${
                    feature.color === 'blue' ? 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700' :
                    feature.color === 'green' ? 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700' :
                    'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                  }`} data-testid={`button-demo-${feature.color}`}>
                  See AI Demo
                  <ArrowRight className="w-4 h-4" />
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
                <div className="grid md:grid-cols-3 gap-6 mb-6">
                  <div>
                    <div className="text-5xl font-bold mb-2">$135K+</div>
                    <div className="text-blue-100">Eliminated Salaries</div>
                  </div>
                  <div>
                    <div className="text-5xl font-bold mb-2">$33K+</div>
                    <div className="text-blue-100">Benefits Saved</div>
                  </div>
                  <div>
                    <div className="text-5xl font-bold mb-2">$168K+</div>
                    <div className="text-blue-100">Total Annual Savings</div>
                  </div>
                </div>
                <div className="text-sm text-blue-100 italic">
                  * Based on replacing scheduling coordinator ($55K), payroll admin ($50K), and billing clerk ($48K) + 25% benefits
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
                <div className="font-bold text-lg">
                  <span className="text-white">AUTO</span>
                  <span className="text-blue-400">FORCE</span>
                  <span className="text-xs align-super text-gray-400">™</span>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Autonomous Workforce Management powered by advanced AI
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors" data-testid="footer-link-features">Features</a></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors" data-testid="footer-link-pricing">Pricing</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors" data-testid="footer-link-contact">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/support" className="hover:text-white transition-colors" data-testid="footer-link-support">Support</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors" data-testid="footer-link-contact-us">Contact Us</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/privacy" className="hover:text-white transition-colors" data-testid="footer-link-privacy">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors" data-testid="footer-link-terms">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
            <p>&copy; 2025 AutoForce™. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
