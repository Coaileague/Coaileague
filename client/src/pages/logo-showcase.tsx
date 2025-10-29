import { WorkforceOSLogo } from "@/components/workforceos-logo";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Logo Showcase Page
 * Professional display of WorkforceOS branding for marketing materials, 
 * business cards, screenshots, and website headers
 */
export default function LogoShowcase() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Hero Marketing Logo - For Website Headers & Business Cards */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Marketing Logo (Vertical)</h2>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12 flex flex-col items-center">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-12 border border-emerald-500/20">
                <WorkforceOSLogo 
                  size="hero" 
                  variant="full"
                />
              </div>
              <p className="text-slate-400 text-sm mt-6 text-center max-w-md">
                Use this version for business cards, marketing materials, website headers, and promotional content. 
                The vertical layout makes the logo prominent and professional.
              </p>
              <Button variant="outline" className="mt-4 gap-2">
                <Download className="w-4 h-4" />
                Export for Print
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Horizontal Logo - For Inline Headers */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Header Logo (Horizontal)</h2>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-emerald-500/20 flex justify-center">
                <WorkforceOSLogo 
                  size="xl" 
                  variant="full"
                />
              </div>
              <p className="text-slate-400 text-sm mt-6 text-center max-w-md mx-auto">
                Use this version for navigation bars, email headers, and inline branding.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Size Variations */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Size Variations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <WorkforceOSLogo size="sm" />
                <span className="text-xs text-slate-400">Small</span>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <WorkforceOSLogo size="md" />
                <span className="text-xs text-slate-400">Medium</span>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <WorkforceOSLogo size="lg" />
                <span className="text-xs text-slate-400">Large</span>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <WorkforceOSLogo size="xl" />
                <span className="text-xs text-slate-400">Extra Large</span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* On Dark Backgrounds */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">On Different Backgrounds</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <Card className="bg-slate-950 border-slate-800">
              <CardContent className="p-8 flex flex-col items-center">
                <WorkforceOSLogo size="lg" />
                <span className="text-xs text-slate-500 mt-4">Dark Background</span>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200">
              <CardContent className="p-8 flex flex-col items-center">
                <WorkforceOSLogo size="lg" />
                <span className="text-xs text-slate-500 mt-4">Light Background</span>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-950 to-emerald-900 border-emerald-800">
              <CardContent className="p-8 flex flex-col items-center">
                <WorkforceOSLogo size="lg" />
                <span className="text-xs text-emerald-300 mt-4">Emerald Background</span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Brand Guidelines */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Brand Guidelines</h2>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-8 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-emerald-400 mb-2">The Icon</h3>
                <p className="text-slate-300">
                  A clock face with a person silhouette rotating as the clock hand. This represents 
                  <strong className="text-white"> time tracking your workforce</strong> - the core value proposition.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-400 mb-2">Brand Colors</h3>
                <div className="flex gap-4 mt-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-lg bg-emerald-600 border-2 border-white/20" />
                    <span className="text-xs text-slate-400">#059669</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-lg bg-slate-800 border-2 border-white/20" />
                    <span className="text-xs text-slate-400">#1E293B</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-lg bg-slate-900 border-2 border-white/20" />
                    <span className="text-xs text-slate-400">#0F172A</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-400 mb-2">Typography</h3>
                <p className="text-slate-300">
                  <strong className="font-black text-2xl bg-gradient-to-br from-emerald-500 to-emerald-400 bg-clip-text text-transparent">
                    WorkforceOS
                  </strong>
                  <br />
                  <span className="text-sm text-slate-400">Font: Inter Black, Gradient: Emerald-500 to Emerald-400</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
