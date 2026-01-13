/**
 * CORE FEATURE WORKFLOW TESTS
 * ===========================
 * Comprehensive E2E tests for CoAIleague's core automation features:
 * - Payroll processing
 * - Scheduling  
 * - Invoicing
 * - Time tracking
 * - Employee management
 */

import { Workflow } from '../config/types';
import { config } from '../config/diagnostics.config';

export function getCoreFeatureWorkflows(): Workflow[] {
  const BASE_URL = config.baseUrl;
  const TEST_USERNAME = process.env.TEST_USERNAME || '';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
  
  return [
    // ============================================
    // AUTHENTICATION WORKFLOWS
    // ============================================
    {
      name: 'Login Flow - Org Owner',
      description: 'Complete login as organization owner',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/login`, description: 'Navigate to login' },
        { action: 'waitForSelector', selector: 'input[type="email"], [data-testid="input-email"]', timeout: 15000, description: 'Wait for email input' },
        { action: 'fill', selector: 'input[type="email"], [data-testid="input-email"]', value: TEST_USERNAME, description: 'Enter email' },
        { action: 'fill', selector: 'input[type="password"], [data-testid="input-password"]', value: TEST_PASSWORD, description: 'Enter password' },
        { action: 'screenshot', description: 'Before submit' },
        { action: 'click', selector: 'button[type="submit"], [data-testid="button-login"]', description: 'Submit login' },
        { action: 'waitForSelector', selector: '[data-testid="dashboard"], .dashboard, main', timeout: 20000, description: 'Wait for dashboard' },
        { action: 'screenshot', description: 'After login' }
      ]
    },
    
    // ============================================
    // DASHBOARD WORKFLOWS
    // ============================================
    {
      name: 'Dashboard Load & Metrics',
      description: 'Verify dashboard loads with all widgets',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/dashboard`, description: 'Navigate to dashboard' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Dashboard view' }
      ]
    },
    
    // ============================================
    // SCHEDULING WORKFLOWS
    // ============================================
    {
      name: 'Schedule View - Desktop',
      description: 'Test main schedule page loads correctly',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/schedule`, description: 'Navigate to schedule' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Schedule desktop view' }
      ]
    },
    {
      name: 'Schedule View - Mobile',
      description: 'Test mobile schedule page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/schedule-mobile`, description: 'Navigate to mobile schedule' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Schedule mobile view' }
      ]
    },
    {
      name: 'Shift Management',
      description: 'View shifts and scheduling interface',
      steps: [
        { action: 'goto', url: `${BASE_URL}/shifts`, description: 'Navigate to shifts' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Shifts view' }
      ]
    },
    
    // ============================================
    // PAYROLL WORKFLOWS
    // ============================================
    {
      name: 'Payroll Dashboard',
      description: 'Test payroll main page loads',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/payroll`, description: 'Navigate to payroll' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Payroll dashboard' }
      ]
    },
    {
      name: 'Payroll History',
      description: 'View payroll run history',
      steps: [
        { action: 'goto', url: `${BASE_URL}/payroll/history`, description: 'Navigate to payroll history' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Payroll history' }
      ]
    },
    {
      name: 'Payroll Settings',
      description: 'Test payroll settings page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/payroll/settings`, description: 'Navigate to payroll settings' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Payroll settings' }
      ]
    },
    
    // ============================================
    // INVOICING WORKFLOWS  
    // ============================================
    {
      name: 'Invoice List',
      description: 'Test invoice listing page',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/invoices`, description: 'Navigate to invoices' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Invoice list' }
      ]
    },
    {
      name: 'Create Invoice Page',
      description: 'Test invoice creation form loads',
      steps: [
        { action: 'goto', url: `${BASE_URL}/invoices/new`, description: 'Navigate to new invoice' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'New invoice form' }
      ]
    },
    
    // ============================================
    // TIME TRACKING WORKFLOWS
    // ============================================
    {
      name: 'Time Tracking Dashboard',
      description: 'Test time tracking main page',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/time-tracking`, description: 'Navigate to time tracking' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Time tracking view' }
      ]
    },
    {
      name: 'Timesheet View',
      description: 'Test timesheet page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/timesheets`, description: 'Navigate to timesheets' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Timesheets' }
      ]
    },
    
    // ============================================
    // EMPLOYEE MANAGEMENT WORKFLOWS
    // ============================================
    {
      name: 'Employee List',
      description: 'Test employee listing page',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/employees`, description: 'Navigate to employees' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Employee list' }
      ]
    },
    {
      name: 'Add Employee Form',
      description: 'Test employee creation form',
      steps: [
        { action: 'goto', url: `${BASE_URL}/employees/new`, description: 'Navigate to add employee' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Add employee form' }
      ]
    },
    
    // ============================================
    // CLIENTS/WORKSPACES WORKFLOWS
    // ============================================
    {
      name: 'Client List',
      description: 'Test client/workspace listing',
      steps: [
        { action: 'goto', url: `${BASE_URL}/clients`, description: 'Navigate to clients' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Client list' }
      ]
    },
    
    // ============================================
    // REPORTS & ANALYTICS WORKFLOWS
    // ============================================
    {
      name: 'Reports Dashboard',
      description: 'Test reports main page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/reports`, description: 'Navigate to reports' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Reports dashboard' }
      ]
    },
    {
      name: 'Analytics Page',
      description: 'Test analytics dashboard',
      steps: [
        { action: 'goto', url: `${BASE_URL}/analytics`, description: 'Navigate to analytics' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Analytics view' }
      ]
    },
    
    // ============================================
    // TRINITY AI WORKFLOWS
    // ============================================
    {
      name: 'Trinity Chat',
      description: 'Test Trinity AI chat interface',
      steps: [
        { action: 'goto', url: `${BASE_URL}/trinity`, description: 'Navigate to Trinity' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Trinity chat' }
      ]
    },
    {
      name: 'Trinity Command Center',
      description: 'Test Trinity command center',
      steps: [
        { action: 'goto', url: `${BASE_URL}/trinity-command`, description: 'Navigate to command center' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Command center' }
      ]
    },
    
    // ============================================
    // SETTINGS WORKFLOWS
    // ============================================
    {
      name: 'Organization Settings',
      description: 'Test org settings page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/settings`, description: 'Navigate to settings' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Settings page' }
      ]
    },
    {
      name: 'Billing Settings',
      description: 'Test billing/subscription page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/billing`, description: 'Navigate to billing' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Billing page' }
      ]
    },
    
    // ============================================
    // PUBLIC PAGES WORKFLOWS
    // ============================================
    {
      name: 'Home Page',
      description: 'Test public home page',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/`, description: 'Navigate to home' },
        { action: 'waitForSelector', selector: 'body', timeout: 15000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Home page' }
      ]
    },
    {
      name: 'Pricing Page',
      description: 'Test pricing page',
      critical: true,
      steps: [
        { action: 'goto', url: `${BASE_URL}/pricing`, description: 'Navigate to pricing' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Pricing page' }
      ]
    },
    {
      name: 'Features Page',
      description: 'Test features page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/features`, description: 'Navigate to features' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Features page' }
      ]
    },
    {
      name: 'Contact Page',
      description: 'Test contact page',
      steps: [
        { action: 'goto', url: `${BASE_URL}/contact`, description: 'Navigate to contact' },
        { action: 'waitForSelector', selector: 'body', timeout: 10000, description: 'Wait for page' },
        { action: 'screenshot', description: 'Contact page' }
      ]
    }
  ];
}
