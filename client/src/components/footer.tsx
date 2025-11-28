/**
 * Footer Component - Consistent CoAIleague branding for all public pages
 * Includes links to support, contact, legal, and company information
 */

import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import { Mail, Phone, MapPin } from "lucide-react";

interface FooterProps {
  variant?: "light" | "dark";
}

export function Footer({ variant = "light" }: FooterProps) {
  const [, setLocation] = useLocation();

  const bgClass = variant === "dark" ? "bg-slate-900 border-slate-800" : "bg-background border-slate-200";
  const textClass = variant === "dark" ? "text-slate-300" : "text-foreground";
  const linkClass = variant === "dark" 
    ? "text-slate-400 hover:text-cyan-400 transition-colors" 
    : "text-muted-foreground hover:text-primary transition-colors";
  const headingClass = variant === "dark" ? "text-white" : "text-foreground";

  return (
    <footer className={`border-t ${bgClass} py-12 sm:py-16`}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <div className="mb-4">
              <CoAIleagueLogo
                width={160}
                height={40}
                showTagline={false}
                showWordmark={true}
                variant={variant === "dark" ? "dark" : "light"}
              />
            </div>
            <p className={`text-sm ${variant === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
              Autonomous Management Solutions for modern enterprises.
            </p>
          </div>

          {/* Product Links */}
          <div>
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
                  onClick={() => setLocation("/")}
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
          <div>
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
          <div>
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
                <a
                  href="#security"
                  className={linkClass}
                  data-testid="footer-link-security"
                >
                  Security
                </a>
              </li>
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h4 className={`font-semibold mb-4 text-sm uppercase tracking-wider ${headingClass}`}>
              Get Started
            </h4>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setLocation("/login")}
                data-testid="footer-button-login"
              >
                Login
              </Button>
              <Button
                size="sm"
                className="w-full text-xs"
                onClick={() => setLocation("/register")}
                data-testid="footer-button-signup"
              >
                Start Free Trial
              </Button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={`border-t ${variant === "dark" ? "border-slate-800" : "border-slate-200"} pt-8`} />

        {/* Bottom Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Copyright */}
          <div className={`text-sm ${textClass}`}>
            <p data-testid="footer-copyright">
              © 2025 CoAIleague™. All rights reserved.
            </p>
            <p className={`text-xs ${variant === "dark" ? "text-slate-500" : "text-muted-foreground"} mt-1`}>
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
          <div className={`flex justify-end gap-4 text-sm`}>
            <a href="#" className={linkClass} aria-label="Twitter" data-testid="footer-twitter">
              Twitter
            </a>
            <a href="#" className={linkClass} aria-label="LinkedIn" data-testid="footer-linkedin">
              LinkedIn
            </a>
            <a href="#" className={linkClass} aria-label="GitHub" data-testid="footer-github">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
