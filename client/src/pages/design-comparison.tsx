import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, TrendingUp, Shield, Award, Factory } from "lucide-react";

export default function DesignComparison() {
  const designs = [
    {
      id: 1,
      name: "Corporate Executive",
      tagline: "Fortune 500 Boardroom",
      colors: {
        primary: "#1e40af", // Deep navy
        secondary: "#475569", // Slate gray
        accent: "#3b82f6", // Bright blue
        bg: "#0f172a", // Very dark navy
        card: "#1e293b",
        text: "#f8fafc"
      },
      logo: "W",
      logoShape: "shield",
      vibe: "IBM • Workday • Oracle",
      bestFor: "Large enterprises, HR departments, C-suite buyers"
    },
    {
      id: 2,
      name: "Modern Tech Dashboard",
      tagline: "Silicon Valley SaaS",
      colors: {
        primary: "#059669", // Emerald green
        secondary: "#64748b", // Cool gray
        accent: "hsl(162, 29%, 45%)", // Lighter emerald
        bg: "#0f172a", // Dark charcoal
        card: "#1e293b",
        text: "#f1f5f9"
      },
      logo: "⚉",
      logoShape: "team-circle",
      vibe: "Stripe • Linear • Notion",
      bestFor: "Tech-savvy businesses, scaling startups, innovators"
    },
    {
      id: 3,
      name: "Industrial Strength",
      tagline: "Built Like a Tank",
      colors: {
        primary: "#0284c7", // Steel blue
        secondary: "#52525b", // Titanium gray
        accent: "#06b6d4", // Electric cyan
        bg: "#18181b", // Almost black
        card: "#27272a",
        text: "#fafafa"
      },
      logo: "⚙",
      logoShape: "gear",
      vibe: "Caterpillar • Boeing • Industrial",
      bestFor: "Manufacturing, construction, logistics, field service"
    },
    {
      id: 4,
      name: "Premium Workspace",
      tagline: "Luxury Experience",
      colors: {
        primary: "#d4af37", // Champagne gold
        secondary: "#71717a", // Warm gray
        accent: "#eab308", // Gold yellow
        bg: "#18181b", // Charcoal
        card: "#27272a",
        text: "#fafaf9"
      },
      logo: "♔",
      logoShape: "crown",
      vibe: "Luxury Hotel • Private Club",
      bestFor: "Premium services, boutique firms, white-glove support"
    },
    {
      id: 5,
      name: "Data Command Center",
      tagline: "Mission Control",
      colors: {
        primary: "#7c3aed", // Deep purple
        secondary: "#6b7280", // Neutral gray
        accent: "#a78bfa", // Lighter purple
        bg: "#111827", // Dark slate
        card: "#1f2937",
        text: "#f9fafb"
      },
      logo: "◈",
      logoShape: "diamond",
      vibe: "NASA • SpaceX • Analytics Platform",
      bestFor: "Data-driven companies, analytics-focused, tech leaders"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">
            WorkforceOS Rebrand Options
          </h1>
          <p className="text-lg text-slate-400">
            Choose the design direction that best represents your brand vision
          </p>
        </div>

        {/* Design Options Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {designs.map((design) => (
            <Card
              key={design.id}
              className="overflow-hidden border-2 hover-elevate active-elevate-2 transition-all"
              style={{
                borderColor: design.colors.primary,
                backgroundColor: design.colors.bg
              }}
              data-testid={`design-option-${design.id}`}
            >
              {/* Header with logo */}
              <div
                className="p-6 border-b-2"
                style={{
                  backgroundColor: design.colors.card,
                  borderColor: design.colors.primary
                }}
              >
                <div className="flex items-center gap-4 mb-4">
                  {/* Logo */}
                  <div
                    className="w-16 h-16 rounded-lg flex items-center justify-center text-4xl font-bold"
                    style={{
                      backgroundColor: design.colors.primary,
                      color: design.colors.text
                    }}
                  >
                    {design.logo}
                  </div>
                  <div>
                    <h2
                      className="text-xl font-bold"
                      style={{ color: design.colors.text }}
                    >
                      {design.name}
                    </h2>
                    <p
                      className="text-sm"
                      style={{ color: design.colors.secondary }}
                    >
                      {design.tagline}
                    </p>
                  </div>
                </div>

                {/* Color Palette */}
                <div className="flex gap-2">
                  <div
                    className="w-8 h-8 rounded"
                    style={{ backgroundColor: design.colors.primary }}
                    title="Primary"
                  />
                  <div
                    className="w-8 h-8 rounded"
                    style={{ backgroundColor: design.colors.secondary }}
                    title="Secondary"
                  />
                  <div
                    className="w-8 h-8 rounded"
                    style={{ backgroundColor: design.colors.accent }}
                    title="Accent"
                  />
                  <div
                    className="w-8 h-8 rounded border border-slate-600"
                    style={{ backgroundColor: design.colors.card }}
                    title="Card"
                  />
                </div>
              </div>

              <CardContent className="p-6 space-y-4" style={{ backgroundColor: design.colors.card }}>
                {/* Sample Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="p-3 rounded-lg border"
                    style={{
                      backgroundColor: design.colors.bg,
                      borderColor: design.colors.primary + "40"
                    }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: design.colors.primary }}
                    >
                      847
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: design.colors.secondary }}
                    >
                      EMPLOYEES
                    </div>
                  </div>
                  <div
                    className="p-3 rounded-lg border"
                    style={{
                      backgroundColor: design.colors.bg,
                      borderColor: design.colors.primary + "40"
                    }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: design.colors.primary }}
                    >
                      98%
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: design.colors.secondary }}
                    >
                      UPTIME
                    </div>
                  </div>
                </div>

                {/* Sample Buttons */}
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
                    style={{
                      backgroundColor: design.colors.primary,
                      color: design.id === 4 ? "#000" : design.colors.text
                    }}
                  >
                    Primary
                  </button>
                  <button
                    className="flex-1 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all hover:opacity-80"
                    style={{
                      borderColor: design.colors.primary,
                      color: design.colors.primary,
                      backgroundColor: "transparent"
                    }}
                  >
                    Secondary
                  </button>
                </div>

                {/* Sample Badge */}
                <div className="flex gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: design.colors.primary + "30",
                      color: design.colors.accent
                    }}
                  >
                    Active
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: design.colors.secondary + "30",
                      color: design.colors.secondary
                    }}
                  >
                    Enterprise
                  </span>
                </div>

                {/* Info */}
                <div className="pt-4 border-t" style={{ borderColor: design.colors.primary + "30" }}>
                  <p
                    className="text-xs font-semibold mb-2"
                    style={{ color: design.colors.accent }}
                  >
                    {design.vibe}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: design.colors.secondary }}
                  >
                    {design.bestFor}
                  </p>
                </div>

                {/* Select Button */}
                <Button
                  className="w-full"
                  data-testid={`select-design-${design.id}`}
                  onClick={() => {
                    alert(`You selected: ${design.name}\n\nI'll now rebrand the entire platform with this design!`);
                  }}
                  style={{
                    backgroundColor: design.colors.primary,
                    color: design.id === 4 ? "#000" : design.colors.text
                  }}
                >
                  Select This Design
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center text-sm text-slate-500 pt-8">
          <p>Once you select a design, I'll apply it across the entire WorkforceOS platform</p>
          <p className="mt-2">This includes: Logo, colors, headers, sidebars, cards, buttons, and all UI components</p>
        </div>
      </div>
    </div>
  );
}
