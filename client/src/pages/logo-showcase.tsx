import { AutoForceAFLogo } from "@/components/autoforce-af-logo";
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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Hero Marketing Logo - For Website Headers & Business Cards */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Marketing Logo (Vertical)</h2>
          <Card>
            <CardContent className="p-12 flex flex-col items-center">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-12 border border-primary/20">
                <AutoForceAFLogo 
                  size="hero" 
                  variant="full"
                />
              </div>
              <p className="text-muted-foreground text-sm mt-6 text-center max-w-md">
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
          <h2 className="text-2xl font-bold  mb-6">Header Logo (Horizontal)</h2>
          <Card className="">
            <CardContent className="p-12">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-primary/20 flex justify-center">
                <AutoForceAFLogo 
                  size="xl" 
                  variant="full"
                />
              </div>
              <p className="text-muted-foreground text-sm mt-6 text-center max-w-md mx-auto">
                Use this version for navigation bars, email headers, and inline branding.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Size Variations */}
        <section>
          <h2 className="text-2xl font-bold  mb-6">Size Variations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <Card className="">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <AutoForceAFLogo size="sm" />
                <span className="text-xs text-muted-foreground">Small</span>
              </CardContent>
            </Card>

            <Card className="">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <AutoForceAFLogo size="md" />
                <span className="text-xs text-muted-foreground">Medium</span>
              </CardContent>
            </Card>

            <Card className="">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <AutoForceAFLogo size="lg" />
                <span className="text-xs text-muted-foreground">Large</span>
              </CardContent>
            </Card>

            <Card className="">
              <CardContent className="p-8 flex flex-col items-center gap-4">
                <AutoForceAFLogo size="xl" />
                <span className="text-xs text-muted-foreground">Extra Large</span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* On Dark Backgrounds */}
        <section>
          <h2 className="text-2xl font-bold  mb-6">On Different Backgrounds</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <Card className="bg-slate-950 border-slate-800">
              <CardContent className="p-8 flex flex-col items-center">
                <AutoForceAFLogo size="lg" />
                <span className="text-xs text-slate-500 mt-4">Dark Background</span>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200">
              <CardContent className="p-8 flex flex-col items-center">
                <AutoForceAFLogo size="lg" />
                <span className="text-xs text-slate-500 mt-4">Light Background</span>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-950 to-slate-900 border-primary">
              <CardContent className="p-8 flex flex-col items-center">
                <AutoForceAFLogo size="lg" />
                <span className="text-xs text-primary mt-4">Emerald Background</span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Brand Guidelines */}
        <section>
          <h2 className="text-2xl font-bold  mb-6">Brand Guidelines</h2>
          <Card className="">
            <CardContent className="p-8 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">The Icon</h3>
                <p className="text-foreground">
                  A clock face with a person silhouette rotating as the clock hand. This represents 
                  <strong className=""> time tracking your workforce</strong> - the core value proposition.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Brand Colors</h3>
                <div className="flex gap-4 mt-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-lg bg-primary border-2 border-white/20" />
                    <span className="text-xs text-muted-foreground">#059669</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-lg bg-slate-800 border-2 border-white/20" />
                    <span className="text-xs text-muted-foreground">#1E293B</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-lg bg-slate-900 border-2 border-white/20" />
                    <span className="text-xs text-muted-foreground">#0F172A</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Typography</h3>
                <p className="text-foreground">
                  <strong className="font-black text-2xl bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
                    WorkforceOS
                  </strong>
                  <br />
                  <span className="text-sm text-muted-foreground">Font: Inter Black, Gradient: Emerald-500 to Emerald-400</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
