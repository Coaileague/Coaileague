import { Router } from "express";
import { PLATFORM } from "../config/platformConfig";

const router = Router();

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: `${PLATFORM.name} Platform API`,
    description: `Comprehensive API for the ${PLATFORM.name} workforce management platform. Covers authentication, employee management, scheduling, invoicing, client management, guard tours, equipment tracking, vehicle fleet management, and reporting.`,
    version: "1.0.0",
    contact: {
      name: `${PLATFORM.name} Support`,
    },
  },
  servers: [
    {
      url: "/api",
      description: "Main API server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "connect.sid",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          role: { type: "string", enum: ["employee", "supervisor", "manager", "admin", "owner"] },
          status: { type: "string", enum: ["active", "inactive", "terminated"] },
          hireDate: { type: "string", format: "date" },
          hourlyRate: { type: "number" },
          position: { type: "string" },
        },
      },
      Shift: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          employeeId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          date: { type: "string", format: "date" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          status: { type: "string", enum: ["scheduled", "in-progress", "completed", "cancelled"] },
          notes: { type: "string" },
        },
      },
      Client: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          address: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
          billingRate: { type: "number" },
        },
      },
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          clientId: { type: "string", format: "uuid" },
          invoiceNumber: { type: "string" },
          amount: { type: "number" },
          status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"] },
          dueDate: { type: "string", format: "date" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      GuardTour: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          name: { type: "string" },
          clientId: { type: "string", format: "uuid" },
          checkpoints: { type: "array", items: { type: "object" } },
          status: { type: "string" },
        },
      },
      EquipmentItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          name: { type: "string" },
          category: { type: "string" },
          serialNumber: { type: "string" },
          status: { type: "string", enum: ["available", "assigned", "maintenance", "retired"] },
        },
      },
      Vehicle: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          make: { type: "string" },
          model: { type: "string" },
          year: { type: "integer" },
          vin: { type: "string" },
          licensePlate: { type: "string" },
          status: { type: "string", enum: ["available", "assigned", "maintenance", "retired"] },
          currentMileage: { type: "integer" },
          fuelType: { type: "string" },
          color: { type: "string" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "firstName", "lastName"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  companyName: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Account created successfully" },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Login successful" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout current user session",
        responses: {
          "200": { description: "Logged out successfully" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        responses: {
          "200": { description: "Current user info" },
          "401": { description: "Not authenticated" },
        },
      },
    },
    "/employees": {
      get: {
        tags: ["Employees"],
        summary: "List all employees in workspace",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" }, description: "Filter by status" },
          { name: "role", in: "query", schema: { type: "string" }, description: "Filter by role" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by name or email" },
        ],
        responses: {
          "200": {
            description: "List of employees",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Employee" } } } },
          },
        },
      },
      post: {
        tags: ["Employees"],
        summary: "Create a new employee",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } },
        },
        responses: {
          "201": { description: "Employee created", content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } } },
          "400": { description: "Validation error" },
        },
      },
    },
    "/employees/{id}": {
      get: {
        tags: ["Employees"],
        summary: "Get employee by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Employee details", content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } } },
          "404": { description: "Employee not found" },
        },
      },
      patch: {
        tags: ["Employees"],
        summary: "Update an employee",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } },
        },
        responses: {
          "200": { description: "Employee updated" },
          "404": { description: "Employee not found" },
        },
      },
      delete: {
        tags: ["Employees"],
        summary: "Delete an employee",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Employee deleted" },
          "404": { description: "Employee not found" },
        },
      },
    },
    "/shifts": {
      get: {
        tags: ["Scheduling"],
        summary: "List shifts",
        parameters: [
          { name: "employeeId", in: "query", schema: { type: "string" }, description: "Filter by employee" },
          { name: "clientId", in: "query", schema: { type: "string" }, description: "Filter by client" },
          { name: "date", in: "query", schema: { type: "string", format: "date" }, description: "Filter by date" },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" }, description: "Start of date range" },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" }, description: "End of date range" },
        ],
        responses: {
          "200": { description: "List of shifts", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Shift" } } } } },
        },
      },
      post: {
        tags: ["Scheduling"],
        summary: "Create a new shift",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Shift" } } },
        },
        responses: {
          "201": { description: "Shift created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/shifts/{id}": {
      get: {
        tags: ["Scheduling"],
        summary: "Get shift by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Shift details" },
          "404": { description: "Shift not found" },
        },
      },
      patch: {
        tags: ["Scheduling"],
        summary: "Update a shift",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Shift" } } },
        },
        responses: {
          "200": { description: "Shift updated" },
          "404": { description: "Shift not found" },
        },
      },
      delete: {
        tags: ["Scheduling"],
        summary: "Delete a shift",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Shift deleted" },
          "404": { description: "Shift not found" },
        },
      },
    },
    "/schedules/publish": {
      post: {
        tags: ["Scheduling"],
        summary: "Publish schedule for a date range",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  startDate: { type: "string", format: "date" },
                  endDate: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Schedule published" },
        },
      },
    },
    "/schedules/duplicate-week": {
      post: {
        tags: ["Scheduling"],
        summary: "Duplicate a week's schedule",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  sourceWeek: { type: "string", format: "date" },
                  targetWeek: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Week duplicated" },
        },
      },
    },
    "/invoices": {
      get: {
        tags: ["Invoices"],
        summary: "List invoices",
        parameters: [
          { name: "clientId", in: "query", schema: { type: "string" }, description: "Filter by client" },
          { name: "status", in: "query", schema: { type: "string" }, description: "Filter by status" },
        ],
        responses: {
          "200": { description: "List of invoices", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Invoice" } } } } },
        },
      },
      post: {
        tags: ["Invoices"],
        summary: "Create a new invoice",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Invoice" } } },
        },
        responses: {
          "201": { description: "Invoice created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/invoices/{id}": {
      get: {
        tags: ["Invoices"],
        summary: "Get invoice by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Invoice details" },
          "404": { description: "Invoice not found" },
        },
      },
      patch: {
        tags: ["Invoices"],
        summary: "Update an invoice",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Invoice updated" },
          "404": { description: "Invoice not found" },
        },
      },
    },
    "/invoices/{id}/send": {
      post: {
        tags: ["Invoices"],
        summary: "Send invoice to client",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Invoice sent" },
          "404": { description: "Invoice not found" },
        },
      },
    },
    "/clients": {
      get: {
        tags: ["Clients"],
        summary: "List all clients",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" }, description: "Filter by status" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by name" },
          { name: "page", in: "query", schema: { type: "integer" }, description: "Page number" },
          { name: "limit", in: "query", schema: { type: "integer" }, description: "Items per page" },
        ],
        responses: {
          "200": { description: "List of clients", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Client" } } } } },
        },
      },
      post: {
        tags: ["Clients"],
        summary: "Create a new client",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Client" } } },
        },
        responses: {
          "201": { description: "Client created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/clients/{id}": {
      get: {
        tags: ["Clients"],
        summary: "Get client by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Client details" },
          "404": { description: "Client not found" },
        },
      },
      patch: {
        tags: ["Clients"],
        summary: "Update a client",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Client updated" },
          "404": { description: "Client not found" },
        },
      },
      delete: {
        tags: ["Clients"],
        summary: "Delete a client",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Client deleted" },
          "404": { description: "Client not found" },
        },
      },
    },
    "/guard-tours": {
      get: {
        tags: ["Guard Tours"],
        summary: "List guard tours",
        parameters: [
          { name: "clientId", in: "query", schema: { type: "string" }, description: "Filter by client" },
        ],
        responses: {
          "200": { description: "List of guard tours", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/GuardTour" } } } } },
        },
      },
      post: {
        tags: ["Guard Tours"],
        summary: "Create a guard tour",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/GuardTour" } } },
        },
        responses: {
          "201": { description: "Guard tour created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/guard-tours/{id}": {
      get: {
        tags: ["Guard Tours"],
        summary: "Get guard tour by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Guard tour details" },
          "404": { description: "Guard tour not found" },
        },
      },
      patch: {
        tags: ["Guard Tours"],
        summary: "Update a guard tour",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Guard tour updated" },
        },
      },
    },
    "/guard-tours/{id}/scan": {
      post: {
        tags: ["Guard Tours"],
        summary: "Record a checkpoint scan",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  checkpointId: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Scan recorded" },
        },
      },
    },
    "/equipment/items": {
      get: {
        tags: ["Equipment"],
        summary: "List equipment items",
        responses: {
          "200": { description: "List of equipment items", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/EquipmentItem" } } } } },
        },
      },
      post: {
        tags: ["Equipment"],
        summary: "Create an equipment item",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EquipmentItem" } } },
        },
        responses: {
          "201": { description: "Equipment item created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/equipment/items/{id}": {
      get: {
        tags: ["Equipment"],
        summary: "Get equipment item by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Equipment item details" },
          "404": { description: "Equipment item not found" },
        },
      },
      patch: {
        tags: ["Equipment"],
        summary: "Update an equipment item",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Equipment item updated" },
          "404": { description: "Equipment item not found" },
        },
      },
      delete: {
        tags: ["Equipment"],
        summary: "Delete an equipment item",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Equipment item deleted" },
          "404": { description: "Equipment item not found" },
        },
      },
    },
    "/equipment/assignments": {
      get: {
        tags: ["Equipment"],
        summary: "List equipment assignments",
        parameters: [
          { name: "equipmentItemId", in: "query", schema: { type: "string" }, description: "Filter by equipment item" },
          { name: "employeeId", in: "query", schema: { type: "string" }, description: "Filter by employee" },
        ],
        responses: {
          "200": { description: "List of assignments" },
        },
      },
      post: {
        tags: ["Equipment"],
        summary: "Assign equipment to employee",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["equipmentItemId", "employeeId"],
                properties: {
                  equipmentItemId: { type: "string" },
                  employeeId: { type: "string" },
                  expectedReturnDate: { type: "string", format: "date" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Equipment assigned" },
        },
      },
    },
    "/equipment/assignments/{id}/return": {
      post: {
        tags: ["Equipment"],
        summary: "Return assigned equipment",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  condition: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Equipment returned" },
        },
      },
    },
    "/equipment/maintenance": {
      get: {
        tags: ["Equipment"],
        summary: "List maintenance logs",
        parameters: [
          { name: "equipmentItemId", in: "query", schema: { type: "string" }, description: "Filter by equipment item" },
        ],
        responses: {
          "200": { description: "List of maintenance logs" },
        },
      },
      post: {
        tags: ["Equipment"],
        summary: "Create a maintenance log entry",
        responses: {
          "201": { description: "Maintenance log created" },
        },
      },
    },
    "/vehicles": {
      get: {
        tags: ["Vehicles"],
        summary: "List vehicles in fleet",
        responses: {
          "200": { description: "List of vehicles", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Vehicle" } } } } },
        },
      },
      post: {
        tags: ["Vehicles"],
        summary: "Add a vehicle to the fleet",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Vehicle" } } },
        },
        responses: {
          "201": { description: "Vehicle created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/vehicles/{id}": {
      get: {
        tags: ["Vehicles"],
        summary: "Get vehicle by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Vehicle details" },
          "404": { description: "Vehicle not found" },
        },
      },
      patch: {
        tags: ["Vehicles"],
        summary: "Update a vehicle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Vehicle updated" },
          "404": { description: "Vehicle not found" },
        },
      },
      delete: {
        tags: ["Vehicles"],
        summary: "Delete a vehicle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Vehicle deleted" },
          "404": { description: "Vehicle not found" },
        },
      },
    },
    "/vehicles/{id}/assignments": {
      get: {
        tags: ["Vehicles"],
        summary: "Get assignment history for a vehicle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assignment history" },
        },
      },
    },
    "/vehicles/{id}/checkout": {
      post: {
        tags: ["Vehicles"],
        summary: "Checkout a vehicle to an employee",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["employeeId"],
                properties: {
                  employeeId: { type: "string" },
                  startMileage: { type: "integer" },
                  purpose: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Vehicle checked out" },
        },
      },
    },
    "/vehicles/{id}/return": {
      post: {
        tags: ["Vehicles"],
        summary: "Return a checked-out vehicle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  endMileage: { type: "integer" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Vehicle returned" },
        },
      },
    },
    "/vehicles/{id}/maintenance": {
      get: {
        tags: ["Vehicles"],
        summary: "Get maintenance history for a vehicle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Maintenance records" },
        },
      },
      post: {
        tags: ["Vehicles"],
        summary: "Add a maintenance record",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  date: { type: "string", format: "date" },
                  cost: { type: "number" },
                  vendor: { type: "string" },
                  notes: { type: "string" },
                  nextDueDate: { type: "string", format: "date" },
                  nextDueMileage: { type: "integer" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Maintenance record created" },
        },
      },
    },
    "/reports/payroll": {
      get: {
        tags: ["Reports"],
        summary: "Generate payroll report",
        parameters: [
          { name: "startDate", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", required: true, schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "Payroll report data" },
        },
      },
    },
    "/reports/attendance": {
      get: {
        tags: ["Reports"],
        summary: "Generate attendance report",
        parameters: [
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "employeeId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Attendance report data" },
        },
      },
    },
    "/reports/overtime": {
      get: {
        tags: ["Reports"],
        summary: "Generate overtime report",
        parameters: [
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "Overtime report data" },
        },
      },
    },
    "/reports/client-hours": {
      get: {
        tags: ["Reports"],
        summary: "Generate client hours report",
        parameters: [
          { name: "clientId", in: "query", schema: { type: "string" } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "Client hours report data" },
        },
      },
    },
    "/time-entries": {
      get: {
        tags: ["Scheduling"],
        summary: "List time entries",
        parameters: [
          { name: "employeeId", in: "query", schema: { type: "string" } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "List of time entries" },
        },
      },
      post: {
        tags: ["Scheduling"],
        summary: "Create a time entry (clock in/out)",
        responses: {
          "201": { description: "Time entry created" },
        },
      },
    },
  },
  tags: [
    { name: "Auth", description: "Authentication and user management" },
    { name: "Employees", description: "Employee CRUD and management" },
    { name: "Scheduling", description: "Shifts, schedules, and time entries" },
    { name: "Invoices", description: "Invoice management and billing" },
    { name: "Clients", description: "Client management" },
    { name: "Guard Tours", description: "Guard tour tracking and checkpoint scanning" },
    { name: "Equipment", description: "Equipment items, assignments, and maintenance" },
    { name: "Vehicles", description: "Fleet and vehicle management" },
    { name: "Reports", description: "Reporting and analytics" },
  ],
};

router.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

router.get("/", (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${PLATFORM.name} API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    #swagger-ui { max-width: 1400px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api-docs/openapi.json",
      dom_id: "#swagger-ui",
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
      ],
      layout: "BaseLayout",
      deepLinking: true,
    });
  </script>
</body>
</html>`;
  res.type("html").send(html);
});

export default router;
