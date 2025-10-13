// Multi-tenant SaaS API Routes
// References: javascript_log_in_with_replit, javascript_database, javascript_stripe blueprints

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { sendShiftAssignmentEmail, sendInvoiceGeneratedEmail, sendEmployeeOnboardingEmail } from "./email";
import { 
  insertWorkspaceSchema,
  insertEmployeeSchema,
  insertClientSchema,
  insertShiftSchema,
  insertTimeEntrySchema,
  insertInvoiceSchema,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================
  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Demo login route - bypasses authentication for demo workspace
  app.get('/api/demo-login', async (req: any, res) => {
    try {
      const DEMO_USER_ID = "demo-user-00000000";
      
      // Check if demo user exists, create if not
      let demoUser = await storage.getUser(DEMO_USER_ID);
      if (!demoUser) {
        // Seed demo workspace
        const { seedDemoWorkspace } = await import("./seed-demo");
        await seedDemoWorkspace();
        demoUser = await storage.getUser(DEMO_USER_ID);
      }

      // Create session manually (bypass OIDC)
      req.session.passport = {
        user: {
          claims: {
            sub: DEMO_USER_ID,
            email: "demo@shiftsync.app",
            first_name: "Demo",
            last_name: "User"
          }
        }
      };

      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      // Redirect to dashboard
      res.redirect('/dashboard');
    } catch (error) {
      console.error("Error in demo login:", error);
      res.status(500).json({ message: "Failed to start demo" });
    }
  });

  // ============================================================================
  // WORKSPACE ROUTES
  // ============================================================================
  
  // Get or create workspace for current user
  app.get('/api/workspace', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let workspace = await storage.getWorkspaceByOwnerId(userId);
      
      // Auto-create workspace on first login
      if (!workspace) {
        const user = await storage.getUser(userId);
        workspace = await storage.createWorkspace({
          name: `${user?.firstName || user?.email || 'My'}'s Workspace`,
          ownerId: userId,
        });
      }
      
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  // Update workspace
  app.patch('/api/workspace', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no ownerId override
      const { ownerId, ...updateData } = req.body;
      const validated = insertWorkspaceSchema.partial().parse(updateData);

      const updated = await storage.updateWorkspace(workspace.id, validated);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating workspace:", error);
      res.status(400).json({ message: error.message || "Failed to update workspace" });
    }
  });

  // ============================================================================
  // EMPLOYEE ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const employees = await storage.getEmployeesByWorkspace(workspace.id);
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.post('/api/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertEmployeeSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const employee = await storage.createEmployee(validated);
      
      // Send onboarding email if employee has email
      if (employee.email) {
        sendEmployeeOnboardingEmail(employee.email, {
          employeeName: `${employee.firstName} ${employee.lastName}`,
          workspaceName: workspace.name,
          role: employee.role || undefined
        }).catch(err => console.error('Failed to send onboarding email:', err));
      }
      
      res.json(employee);
    } catch (error: any) {
      console.error("Error creating employee:", error);
      res.status(400).json({ message: error.message || "Failed to create employee" });
    }
  });

  app.patch('/api/employees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no workspaceId override
      const { workspaceId, ...updateData } = req.body;
      const validated = insertEmployeeSchema.partial().parse(updateData);

      const employee = await storage.updateEmployee(req.params.id, workspace.id, validated);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      res.json(employee);
    } catch (error: any) {
      console.error("Error updating employee:", error);
      res.status(400).json({ message: error.message || "Failed to update employee" });
    }
  });

  app.delete('/api/employees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteEmployee(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // ============================================================================
  // CLIENT ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const clients = await storage.getClientsByWorkspace(workspace.id);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post('/api/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertClientSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const client = await storage.createClient(validated);
      res.json(client);
    } catch (error: any) {
      console.error("Error creating client:", error);
      res.status(400).json({ message: error.message || "Failed to create client" });
    }
  });

  app.patch('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no workspaceId override
      const { workspaceId, ...updateData } = req.body;
      const validated = insertClientSchema.partial().parse(updateData);

      const client = await storage.updateClient(req.params.id, workspace.id, validated);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json(client);
    } catch (error: any) {
      console.error("Error updating client:", error);
      res.status(400).json({ message: error.message || "Failed to update client" });
    }
  });

  app.delete('/api/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteClient(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // ============================================================================
  // SHIFT ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/shifts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const shifts = await storage.getShiftsByWorkspace(workspace.id);
      res.json(shifts);
    } catch (error) {
      console.error("Error fetching shifts:", error);
      res.status(500).json({ message: "Failed to fetch shifts" });
    }
  });

  app.post('/api/shifts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertShiftSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const shift = await storage.createShift(validated);
      
      // Send shift assignment email if employee has email
      if (shift.employeeId) {
        const employee = await storage.getEmployee(shift.employeeId, workspace.id);
        const client = shift.clientId ? await storage.getClient(shift.clientId, workspace.id) : null;
        
        if (employee?.email) {
          const startTime = new Date(shift.startTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short'
          });
          const endTime = new Date(shift.endTime).toLocaleString('en-US', {
            timeStyle: 'short'
          });
          
          sendShiftAssignmentEmail(employee.email, {
            employeeName: `${employee.firstName} ${employee.lastName}`,
            shiftTitle: shift.title || 'Shift',
            startTime,
            endTime,
            clientName: client ? `${client.firstName} ${client.lastName}` : undefined
          }).catch(err => console.error('Failed to send shift assignment email:', err));
        }
      }
      
      res.json(shift);
    } catch (error: any) {
      console.error("Error creating shift:", error);
      res.status(400).json({ message: error.message || "Failed to create shift" });
    }
  });

  app.patch('/api/shifts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate partial update, ensure no workspaceId override
      const { workspaceId, ...updateData } = req.body;
      const validated = insertShiftSchema.partial().parse(updateData);

      const shift = await storage.updateShift(req.params.id, workspace.id, validated);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.json(shift);
    } catch (error: any) {
      console.error("Error updating shift:", error);
      res.status(400).json({ message: error.message || "Failed to update shift" });
    }
  });

  app.delete('/api/shifts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteShift(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shift:", error);
      res.status(500).json({ message: "Failed to delete shift" });
    }
  });

  // Bulk create shifts (recurring)
  app.post('/api/shifts/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { employeeId, clientId, title, description, startDate, endDate, startTime, endTime, recurrence, days } = req.body;
      
      // Create shifts based on recurrence pattern
      const createdShifts = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      while (start <= end) {
        // Check if this day matches the recurrence pattern
        let shouldCreate = false;
        if (recurrence === 'daily') {
          shouldCreate = true;
        } else if (recurrence === 'weekly' && days?.includes(start.getDay())) {
          shouldCreate = true;
        }
        
        if (shouldCreate) {
          const shiftStart = new Date(start);
          const [hours, minutes] = startTime.split(':');
          shiftStart.setHours(parseInt(hours), parseInt(minutes), 0);
          
          const shiftEnd = new Date(start);
          const [endHours, endMinutes] = endTime.split(':');
          shiftEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0);
          
          const shift = await storage.createShift({
            workspaceId: workspace.id,
            employeeId,
            clientId: clientId || null,
            title: title || null,
            description: description || null,
            startTime: shiftStart.toISOString(),
            endTime: shiftEnd.toISOString(),
            status: 'scheduled',
          });
          
          createdShifts.push(shift);
        }
        
        start.setDate(start.getDate() + 1);
      }
      
      res.json({ shifts: createdShifts, count: createdShifts.length });
    } catch (error: any) {
      console.error("Error creating bulk shifts:", error);
      res.status(400).json({ message: error.message || "Failed to create bulk shifts" });
    }
  });

  // ============================================================================
  // SHIFT TEMPLATE ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/shift-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const templates = await storage.getShiftTemplatesByWorkspace(workspace.id);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching shift templates:", error);
      res.status(500).json({ message: "Failed to fetch shift templates" });
    }
  });

  app.post('/api/shift-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const template = await storage.createShiftTemplate({
        ...req.body,
        workspaceId: workspace.id,
      });
      res.json(template);
    } catch (error: any) {
      console.error("Error creating shift template:", error);
      res.status(400).json({ message: error.message || "Failed to create shift template" });
    }
  });

  app.delete('/api/shift-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const deleted = await storage.deleteShiftTemplate(req.params.id, workspace.id);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shift template:", error);
      res.status(500).json({ message: "Failed to delete shift template" });
    }
  });

  // ============================================================================
  // TIME ENTRY ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const entries = await storage.getTimeEntriesByWorkspace(workspace.id);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Validate with Zod and enforce workspace ownership
      const validated = insertTimeEntrySchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
      });

      const entry = await storage.createTimeEntry(validated);
      res.json(entry);
    } catch (error: any) {
      console.error("Error creating time entry:", error);
      res.status(400).json({ message: error.message || "Failed to create time entry" });
    }
  });

  // ============================================================================
  // INVOICE ROUTES (Multi-tenant isolated)
  // ============================================================================
  
  app.get('/api/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const invoices = await storage.getInvoicesByWorkspace(workspace.id);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post('/api/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Validate with Zod and enforce workspace ownership
      const validated = insertInvoiceSchema.parse({
        ...req.body,
        workspaceId: workspace.id, // Force workspace from auth, ignore client input
        invoiceNumber,
        platformFeePercentage: workspace.platformFeePercentage,
      });

      const invoice = await storage.createInvoice(validated);
      res.json(invoice);
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      res.status(400).json({ message: error.message || "Failed to create invoice" });
    }
  });

  app.post('/api/invoices/generate-from-time', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { clientId, timeEntryIds, dueDate, taxRate } = req.body;

      if (!clientId || !timeEntryIds || !Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        return res.status(400).json({ message: "Client ID and time entry IDs are required" });
      }

      // Get the time entries
      const timeEntries = [];
      for (const id of timeEntryIds) {
        const entry = await storage.getTimeEntry(id, workspace.id);
        if (entry && entry.clientId === clientId && entry.clockOut) {
          timeEntries.push(entry);
        }
      }

      if (timeEntries.length === 0) {
        return res.status(400).json({ message: "No valid time entries found" });
      }

      // Calculate totals with NaN guards
      let subtotal = 0;
      for (const entry of timeEntries) {
        const amount = parseFloat(entry.totalAmount as string || "0");
        if (!isNaN(amount)) {
          subtotal += amount;
        }
      }

      // Tax rate is percentage, taxAmount is dollars
      const taxRatePercent = parseFloat(taxRate || "0");
      const taxAmount = isNaN(taxRatePercent) ? 0 : subtotal * (taxRatePercent / 100);
      const total = subtotal + taxAmount;

      // Calculate platform fee
      const platformFeePercent = parseFloat(workspace.platformFeePercentage as string || "0");
      const platformFeeAmount = isNaN(platformFeePercent) ? 0 : total * (platformFeePercent / 100);
      const businessAmount = total - platformFeeAmount;

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Create invoice - store tax rate as percentage, not dollar amount
      const invoice = await storage.createInvoice({
        workspaceId: workspace.id,
        clientId,
        invoiceNumber,
        issueDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        subtotal: subtotal.toFixed(2),
        taxRate: taxRatePercent.toFixed(2), // Store percentage, not dollar amount
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        platformFeePercentage: platformFeePercent.toFixed(2),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        businessAmount: businessAmount.toFixed(2),
        status: "draft",
      });

      // Create line items for each time entry
      for (const entry of timeEntries) {
        await storage.createInvoiceLineItem({
          invoiceId: invoice.id,
          description: entry.notes || `Time entry - ${new Date(entry.clockIn).toLocaleDateString()}`,
          quantity: entry.totalHours as string || "0",
          unitPrice: entry.hourlyRate as string || "0",
          amount: entry.totalAmount as string || "0",
          timeEntryId: entry.id,
        });
      }

      // Send invoice notification email to workspace owner
      const client = await storage.getClient(clientId, workspace.id);
      const owner = await storage.getUser(workspace.ownerId);
      
      if (owner?.email) {
        const dueDate = invoice.dueDate 
          ? new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })
          : 'No due date';
        
        sendInvoiceGeneratedEmail(owner.email, {
          clientName: client ? `${client.firstName} ${client.lastName}` : 'Unknown Client',
          invoiceNumber: invoice.invoiceNumber,
          total: total.toFixed(2),
          dueDate
        }).catch(err => console.error('Failed to send invoice email:', err));
      }

      res.json(invoice);
    } catch (error: any) {
      console.error("Error generating invoice from time entries:", error);
      res.status(400).json({ message: error.message || "Failed to generate invoice" });
    }
  });

  // ============================================================================
  // TIME TRACKING ROUTES
  // ============================================================================
  
  app.get('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntries = await storage.getTimeEntriesByWorkspace(workspace.id);
      res.json(timeEntries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.post('/api/time-entries/clock-in', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const validated = insertTimeEntrySchema.parse({
        ...req.body,
        workspaceId: workspace.id,
        clockIn: new Date().toISOString(),
      });

      const timeEntry = await storage.createTimeEntry(validated);
      res.json(timeEntry);
    } catch (error: any) {
      console.error("Error clocking in:", error);
      res.status(400).json({ message: error.message || "Failed to clock in" });
    }
  });

  app.patch('/api/time-entries/:id/clock-out', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const timeEntry = await storage.getTimeEntry(req.params.id, workspace.id);
      if (!timeEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      const clockOut = new Date();
      const clockIn = new Date(timeEntry.clockIn);
      const totalHours = ((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2);
      
      const hourlyRate = timeEntry.hourlyRate || "0";
      const totalAmount = (parseFloat(totalHours) * parseFloat(hourlyRate as string)).toFixed(2);

      const updated = await storage.updateTimeEntry(req.params.id, workspace.id, {
        clockOut: clockOut.toISOString(),
        totalHours,
        totalAmount,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error clocking out:", error);
      res.status(400).json({ message: error.message || "Failed to clock out" });
    }
  });

  app.get('/api/time-entries/unbilled/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const unbilledEntries = await storage.getUnbilledTimeEntries(workspace.id, req.params.clientId);
      res.json(unbilledEntries);
    } catch (error) {
      console.error("Error fetching unbilled time entries:", error);
      res.status(500).json({ message: "Failed to fetch unbilled time entries" });
    }
  });

  // ============================================================================
  // ANALYTICS ROUTES
  // ============================================================================
  
  app.get('/api/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const analytics = await storage.getWorkspaceAnalytics(workspace.id);
      res.json({
        ...analytics,
        workspace: {
          subscriptionTier: workspace.subscriptionTier,
          maxEmployees: workspace.maxEmployees,
          maxClients: workspace.maxClients,
        },
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ============================================================================
  // STRIPE ROUTES (Ready for when keys are added)
  // ============================================================================
  
  // Note: Stripe integration will be activated once STRIPE_SECRET_KEY is provided
  // This structure is ready for Stripe Connect to:
  // 1. Create connected accounts for workspaces
  // 2. Process payments on behalf of businesses
  // 3. Take platform fee and transfer remainder
  
  app.post('/api/stripe/connect-account', isAuthenticated, async (req: any, res) => {
    try {
      res.status(503).json({ 
        message: "Stripe integration requires STRIPE_SECRET_KEY. Please add your Stripe keys to activate payment processing." 
      });
    } catch (error) {
      console.error("Error creating Stripe account:", error);
      res.status(500).json({ message: "Failed to create Stripe account" });
    }
  });

  app.post('/api/stripe/create-payment', isAuthenticated, async (req: any, res) => {
    try {
      res.status(503).json({ 
        message: "Stripe integration requires STRIPE_SECRET_KEY. Please add your Stripe keys to activate payment processing." 
      });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
