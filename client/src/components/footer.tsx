/**
 * Footer Component - Consistent CoAIleague branding for all public pages
 * Includes links to support, contact, legal, and company information
 */

import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { Mail, Phone, MapPin } from "lucide-react";
import { AIGeneralDisclaimer } from "@/components/liability-disclaimers";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface FooterProps {
  variant?: "light" | "dark";
}

// Default variant is "dark" to match CLAUDE.md §11 platform aesthetic
// (Dark navy command-center). Pages on a light background must opt in
// explicitly with variant="light" — otherwise dark text would render
// invisibly on the dark navy chrome.
export function Footer({ variant = "dark" }: FooterProps) {
  const [, setLocation] = useLocation();

  const bgClass = variant === "dark" ? "bg-slate-900 border-slate-800" : "bg-background border-border";
  const textClass = variant === "dark" ? "text-slate-300" : "text-foreground";
  const linkClass = variant === "dark" 
    ? "text-slate-400 hover:text-cyan-400 transition-colors" 
    : "text-muted-foreground hover:text-primary transition-colors";
  const headingClass = variant === "dark" ? "text-white" : "text-foreground";

  return (
    <footer className={`border-t ${bgClass} py-4 sm:py-6 md:py-8`}>
      <div className="container mx-auto px-3 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-6 mb-4 sm:mb-6">
          {/* Brand Column - full width on mobile */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="mb-4">
              <UnifiedBrandLogo
                size="lg"
                theme={variant === "dark" ? "dark" : "light"}
              />
            </div>
            <p className={`text-sm max-w-xs ${variant === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
              Intelligent Workforce Management for modern enterprises.
            </p>
          </div>

          {/* Product Links */}
          <div className="min-w-0">
            <h4 className={`font-semibold mb-4 text-sm uppercase tracking-wider ${headingClass}`}>
              Product
            </h4>
            <ul className={`space-y-2 text-sm`}>
              <li>
                <button
                  onClick={() => setLocation("/pricing")}
                  className={linkClass}
                  data-testid="footer-link-pricing"
                >
                  Pricing
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/trinity-features")}
                  className={linkClass}
                  data-testid="footer-link-features"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => window.location.href = "/api/demo-login"}
                  className={linkClass}
                  data-testid="footer-link-demo"
                >
                  Live Demo
                </button>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div className="min-w-0">
            <h4 className={`font-semibold mb-4 text-sm uppercase tracking-wider ${headingClass}`}>
              Company
            </h4>
            <ul className={`space-y-2 text-sm`}>
              <li>
                <button
                  onClick={() => setLocation("/contact")}
                  className={linkClass}
                  data-testid="footer-link-contact"
                >
                  Contact
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/support")}
                  className={linkClass}
                  data-testid="footer-link-support"
                >
                  Support
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/help")}
                  className={linkClass}
                  data-testid="footer-link-help"
                >
                  Help Center
                </button>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="min-w-0">
            <h4 className={`font-semibold mb-4 text-sm uppercase tracking-wider ${headingClass}`}>
              Legal
            </h4>
            <ul className={`space-y-2 text-sm`}>
              <li>
                <button
                  onClick={() => setLocation("/privacy")}
                  className={linkClass}
                  data-testid="footer-link-privacy"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/terms")}
                  className={linkClass}
                  data-testid="footer-link-terms"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/legal/security")}
                  className={linkClass}
                  data-testid="footer-link-security"
                >
                  Security Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/legal/aup")}
                  className={linkClass}
                  data-testid="footer-link-aup"
                >
                  Acceptable Use
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/dpa")}
                  className={linkClass}
                  data-testid="footer-link-dpa"
                >
                  DPA
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLocation("/cookie-policy")}
                  className={linkClass}
                  data-testid="footer-link-cookie"
                >
                  Cookie Policy
                </button>
              </li>
            </ul>
          </div>

          {/* Get Started */}
          <div className="min-w-0">
            <h4 className={`font-semibold mb-4 text-sm uppercase tracking-wider ${headingClass}`}>
              Get Started
            </h4>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs overflow-hidden"
                onClick={() => setLocation("/login")}
                data-testid="footer-button-login"
              >
                <span className="truncate">Login</span>
              </Button>
              <Button
                size="sm"
                className="w-full text-xs overflow-hidden"
                onClick={() => setLocation("/register")}
                data-testid="footer-button-signup"
              >
                <span className="truncate">Start Free Trial</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={`border-t ${variant === "dark" ? "border-slate-800" : "border-border"} pt-4`} />

        {/* Disclaimer 1 — AI Assistance General (required on every page) */}
        <AIGeneralDisclaimer
          className={`mb-4 pb-4 border-b ${variant === "dark" ? "border-slate-800 text-slate-500" : "border-border"}`}
          compact
        />

        {/* Bottom Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Copyright */}
          <div className={`text-sm ${textClass}`}>
            <p data-testid="footer-copyright" className="font-medium">
              © {new Date().getFullYear()} {PLATFORM_NAME}, Inc. All rights reserved.
            </p>
            <p className={`text-xs ${variant === "dark" ? "text-slate-500" : "text-muted-foreground"} mt-1`}>
              Trinity™ is a proprietary trademark of {PLATFORM_NAME}, Inc.
            </p>
            <p className={`text-xs ${variant === "dark" ? "text-slate-500" : "text-muted-foreground"} mt-0.5`}>
              Enterprise-grade workforce automation platform.
            </p>
          </div>

          {/* Contact Info */}
          <div className={`flex flex-col gap-2 text-sm ${textClass}`}>
            <p className={`text-xs uppercase tracking-wider font-semibold ${headingClass}`}>
              Contact Us
            </p>
            <div className="flex items-center gap-2 text-xs">
              <Mail className="w-3.5 h-3.5" />
              <a href="mailto:support@coaileague.com" className={linkClass} data-testid="footer-email">
                support@coaileague.com
              </a>
            </div>
          </div>

          {/* Social/Links */}
          <div className={`flex justify-start md:justify-end gap-4 text-sm`}>
            <a href="/support" className={linkClass} aria-label="Support" data-testid="footer-support-link">
              Support
            </a>
            <a href="/terms" className={linkClass} aria-label="Terms" data-testid="footer-terms-link">
              Terms
            </a>
            <a href="/privacy" className={linkClass} aria-label="Privacy" data-testid="footer-privacy-link">
              Privacy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
