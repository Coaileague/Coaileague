/**
 * ANVIL SECURITY GROUP — CORE SEED
 * Creates workspace, users, employees, clients, workspace members.
 * San Antonio TX area. Idempotent — ON CONFLICT DO NOTHING throughout.
 * Sentinel: workspaces.id = 'dev-anvil-security-ws'
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { typedExec, typedQuery } from '../lib/typedSql';
import {
  users,
  workspaces,
  workspaceMembers,
  employees,
  clients,
  employeePayrollInfo,
  organizationChatRooms,
} from "@shared/schema";

const WS = "dev-anvil-security-ws";
const PASS_HASH = "$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe";

export async function runAnvilCoreSeed(): Promise<{ success: boolean; message: string }> {
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  if (isProduction) return { success: true, message: "Skipped — production" };

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
  const existing = await typedQuery(sql`
    SELECT id FROM workspaces WHERE id = ${WS} LIMIT 1
  `);
  if (existing.length > 0) {
    return { success: true, message: "Anvil core data already seeded — skipped" };
  }

  console.log("[AnvilSeed] Seeding Anvil Security core data...");

  // =====================================================================
  // 1. USERS
  // =====================================================================
  const usersData = [
    { id: "anvil-owner-001", email: "carlos@anvilsecurity.test", firstName: "Carlos",  lastName: "Mendez",    role: "user" },
    { id: "anvil-mgr-001",   email: "diana@anvilsecurity.test",  firstName: "Diana",   lastName: "Torres",    role: "user" },
    { id: "anvil-emp-001",   email: "r.castillo@anvilsecurity.test", firstName: "Rafael",  lastName: "Castillo",  role: "user" },
    { id: "anvil-emp-002",   email: "m.flores@anvilsecurity.test",   firstName: "Maria",   lastName: "Flores",    role: "user" },
    { id: "anvil-emp-003",   email: "j.herrera@anvilsecurity.test",  firstName: "Jorge",   lastName: "Herrera",   role: "user" },
    { id: "anvil-emp-004",   email: "t.nguyen@anvilsecurity.test",   firstName: "Tiffany", lastName: "Nguyen",    role: "user" },
    { id: "anvil-emp-005",   email: "d.patel@anvilsecurity.test",    firstName: "Dev",     lastName: "Patel",     role: "user" },
    { id: "anvil-emp-006",   email: "s.robinson@anvilsecurity.test", firstName: "Sandra",  lastName: "Robinson",  role: "user" },
    { id: "anvil-emp-007",   email: "m.kim@anvilsecurity.test",      firstName: "Marcus",  lastName: "Kim",       role: "user" },
    { id: "anvil-emp-008",   email: "l.reyes@anvilsecurity.test",    firstName: "Luis",    lastName: "Reyes",     role: "user" },
    { id: "anvil-emp-009",   email: "a.johnson@anvilsecurity.test",  firstName: "Ashley",  lastName: "Johnson",   role: "user" },
    { id: "anvil-emp-010",   email: "t.walker@anvilsecurity.test",   firstName: "Tony",    lastName: "Walker",    role: "user" },
  ];
  for (const u of usersData) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(users).values({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      passwordHash: PASS_HASH,
      role: u.role,
      emailVerified: true,
      currentWorkspaceId: WS,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
      loginAttempts: 0,
      mfaEnabled: false,
    }).onConflictDoNothing();
  }

  // =====================================================================
  // 2. WORKSPACE
  // =====================================================================
  // Converted to Drizzle ORM: ON CONFLICT
  await db.insert(workspaces).values({
    id: WS,
    name: 'Anvil Security Group',
    ownerId: 'anvil-owner-001',
    subscriptionTier: 'professional',
    subscriptionStatus: 'active',
    businessCategory: 'security',
    maxEmployees: 30,
    maxClients: 20,
    createdAt: sql`now()`,
    updatedAt: sql`now()`,
  }).onConflictDoNothing();

  // =====================================================================
  // 3. WORKSPACE MEMBERS
  // =====================================================================
  const members = [
    { id: "anvil-wm-001", userId: "anvil-owner-001", role: "org_owner" },
    { id: "anvil-wm-002", userId: "anvil-mgr-001",   role: "manager"   },
    { id: "anvil-wm-003", userId: "anvil-emp-001",   role: "employee"  },
    { id: "anvil-wm-004", userId: "anvil-emp-002",   role: "employee"  },
    { id: "anvil-wm-005", userId: "anvil-emp-003",   role: "employee"  },
    { id: "anvil-wm-006", userId: "anvil-emp-004",   role: "employee"  },
    { id: "anvil-wm-007", userId: "anvil-emp-005",   role: "employee"  },
    { id: "anvil-wm-008", userId: "anvil-emp-006",   role: "employee"  },
    { id: "anvil-wm-009", userId: "anvil-emp-007",   role: "employee"  },
    { id: "anvil-wm-010", userId: "anvil-emp-008",   role: "employee"  },
    { id: "anvil-wm-011", userId: "anvil-emp-009",   role: "employee"  },
    { id: "anvil-wm-012", userId: "anvil-emp-010",   role: "employee"  },
  ];
  for (const m of members) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(workspaceMembers).values({
      id: m.id,
      userId: m.userId,
      workspaceId: WS,
      role: m.role,
      status: 'active',
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =====================================================================
  // 4. EMPLOYEES  (mix W-2 and 1099)
  // =====================================================================
  const emps = [
    { id: "anvil-e-001", userId: "anvil-owner-001", fn: "Carlos",  ln: "Mendez",   email: "carlos@anvilsecurity.test",       rate: "42.00", wsRole: "org_owner" as const, role: "Operations Director",         num: "EMP-ANV-00001", payType: "salary"  },
    { id: "anvil-e-002", userId: "anvil-mgr-001",   fn: "Diana",   ln: "Torres",   email: "diana@anvilsecurity.test",        rate: "32.00", wsRole: "manager" as const,   role: "Field Supervisor",            num: "EMP-ANV-00002", payType: "hourly"  },
    { id: "anvil-e-003", userId: "anvil-emp-001",   fn: "Rafael",  ln: "Castillo", email: "r.castillo@anvilsecurity.test",   rate: "22.50", wsRole: "staff" as const,  role: "Senior Security Officer",     num: "EMP-ANV-00003", payType: "hourly"  },
    { id: "anvil-e-004", userId: "anvil-emp-002",   fn: "Maria",   ln: "Flores",   email: "m.flores@anvilsecurity.test",     rate: "21.00", wsRole: "staff" as const,  role: "Security Officer",            num: "EMP-ANV-00004", payType: "hourly"  },
    { id: "anvil-e-005", userId: "anvil-emp-003",   fn: "Jorge",   ln: "Herrera",  email: "j.herrera@anvilsecurity.test",    rate: "20.50", wsRole: "staff" as const,  role: "Security Officer",            num: "EMP-ANV-00005", payType: "hourly"  },
    { id: "anvil-e-006", userId: "anvil-emp-004",   fn: "Tiffany", ln: "Nguyen",   email: "t.nguyen@anvilsecurity.test",     rate: "24.00", wsRole: "staff" as const,  role: "Access Control Specialist",   num: "EMP-ANV-00006", payType: "hourly"  },
    { id: "anvil-e-007", userId: "anvil-emp-005",   fn: "Dev",     ln: "Patel",    email: "d.patel@anvilsecurity.test",      rate: "23.00", wsRole: "staff" as const,  role: "Security Officer",            num: "EMP-ANV-00007", payType: "hourly"  },
    { id: "anvil-e-008", userId: "anvil-emp-006",   fn: "Sandra",  ln: "Robinson", email: "s.robinson@anvilsecurity.test",   rate: "19.00", wsRole: "staff" as const,  role: "Patrol Officer",              num: "EMP-ANV-00008", payType: "hourly"  },
    { id: "anvil-e-009", userId: "anvil-emp-007",   fn: "Marcus",  ln: "Kim",      email: "m.kim@anvilsecurity.test",        rate: "28.00", wsRole: "staff" as const,  role: "Armed Guard - Level III",     num: "EMP-ANV-00009", payType: "hourly"  },
    { id: "anvil-e-010", userId: "anvil-emp-008",   fn: "Luis",    ln: "Reyes",    email: "l.reyes@anvilsecurity.test",      rate: "18.00", wsRole: "staff" as const,  role: "Security Officer",            num: "EMP-ANV-00010", payType: "hourly"  },
    { id: "anvil-e-011", userId: "anvil-emp-009",   fn: "Ashley",  ln: "Johnson",  email: "a.johnson@anvilsecurity.test",    rate: "21.50", wsRole: "staff" as const,  role: "Dispatch Coordinator",        num: "EMP-ANV-00011", payType: "hourly"  },
    { id: "anvil-e-012", userId: "anvil-emp-010",   fn: "Tony",    ln: "Walker",   email: "t.walker@anvilsecurity.test",     rate: "20.00", wsRole: "staff" as const,  role: "Security Officer (1099)",     num: "EMP-ANV-00012", payType: "hourly"  },
  ];
  for (const e of emps) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employees).values({
      id: e.id,
      workspaceId: WS,
      userId: e.userId,
      firstName: e.fn,
      lastName: e.ln,
      email: e.email,
      hourlyRate: e.rate,
      role: e.role,
      workspaceRole: e.wsRole,
      employeeNumber: e.num,
      onboardingStatus: 'completed',
      payType: e.payType,
      quickbooksSyncStatus: 'pending',
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =====================================================================
  // 5. CLIENTS (San Antonio TX)
  // =====================================================================
  const clientsData = [
    { id: "anvil-c-001", co: "San Antonio Medical Center",    fn: "SA",      ln: "Medical Center",    email: "security@samedcenter.test",    phone: "210-555-1001", addr: "4502 Medical Dr",         city: "San Antonio", zip: "78229", rate: "28.00", poc: "Dr. Janet Cruz",     pocP: "210-555-1002", pocE: "jcruz@samedcenter.test",    pocT: "Chief of Security"     },
    { id: "anvil-c-002", co: "Riverwalk Marriott Hotel",      fn: "Riverwalk", ln: "Hotel",            email: "ops@riverwalkmarriott.test",    phone: "210-555-2001", addr: "889 E Market St",         city: "San Antonio", zip: "78205", rate: "24.00", poc: "Tom Hicks",          pocP: "210-555-2002", pocE: "thicks@riverwalk.test",     pocT: "General Manager"       },
    { id: "anvil-c-003", co: "Pearl District Complex",        fn: "Pearl",   ln: "District",          email: "management@pearldistrict.test", phone: "210-555-3001", addr: "312 Pearl Pkwy",          city: "San Antonio", zip: "78215", rate: "22.00", poc: "Lisa Garza",         pocP: "210-555-3002", pocE: "lgarza@pearldistrict.test", pocT: "Property Manager"      },
    { id: "anvil-c-004", co: "Frost Bank Tower",              fn: "Frost",   ln: "Bank Tower",        email: "facilities@frostbank.test",     phone: "210-555-4001", addr: "100 W Houston St",        city: "San Antonio", zip: "78205", rate: "26.00", poc: "Robert Navarro",     pocP: "210-555-4002", pocE: "rnavarro@frost.test",       pocT: "Facilities Director"   },
    { id: "anvil-c-005", co: "SA Airport Parking Authority",  fn: "SAT",     ln: "Airport Parking",   email: "ops@saairportparking.test",     phone: "210-555-5001", addr: "9800 Airport Blvd",       city: "San Antonio", zip: "78216", rate: "20.00", poc: "Mike Rodriguez",     pocP: "210-555-5002", pocE: "mrodriguez@satparking.test", pocT: "Operations Manager"    },
    { id: "anvil-c-006", co: "UTSA Main Campus",              fn: "UTSA",    ln: "Campus",            email: "security@utsa.test",            phone: "210-555-6001", addr: "1 UTSA Circle",           city: "San Antonio", zip: "78249", rate: "23.00", poc: "Chief Andrea Wells", pocP: "210-555-6002", pocE: "awells@utsa.test",           pocT: "Director Campus Safety" },
  ];
  for (const c of clientsData) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clients).values({
      id: c.id,
      workspaceId: WS,
      firstName: c.fn,
      lastName: c.ln,
      companyName: c.co,
      email: c.email,
      phone: c.phone,
      address: c.addr,
      city: c.city,
      state: 'TX',
      postalCode: c.zip,
      country: 'US',
      contractRate: c.rate,
      contractRateType: 'hourly',
      pocName: c.poc,
      pocPhone: c.pocP,
      pocEmail: c.pocE,
      pocTitle: c.pocT,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =====================================================================
  // 6. EMPLOYEE PAYROLL INFO
  // =====================================================================
  const payInfoRows = [
    { id: "anvil-pi-001", empId: "anvil-e-003", routing: "111000025", account: "4521893001", bankName: "Chase Bank SA",     lastFour: "3001" },
    { id: "anvil-pi-002", empId: "anvil-e-004", routing: "111000025", account: "4521893002", bankName: "Chase Bank SA",     lastFour: "3002" },
    { id: "anvil-pi-003", empId: "anvil-e-005", routing: "322271627", account: "7712334401", bankName: "Wells Fargo SA",    lastFour: "4401" },
    { id: "anvil-pi-004", empId: "anvil-e-006", routing: "322271627", account: "7712334402", bankName: "Wells Fargo SA",    lastFour: "4402" },
    { id: "anvil-pi-005", empId: "anvil-e-007", routing: "021000021", account: "8834129001", bankName: "Bank of America SA",lastFour: "9001" },
    { id: "anvil-pi-006", empId: "anvil-e-008", routing: "021000021", account: "8834129002", bankName: "Bank of America SA",lastFour: "9002" },
    { id: "anvil-pi-007", empId: "anvil-e-009", routing: "111000025", account: "4521893009", bankName: "Chase Bank SA",     lastFour: "3009" },
    { id: "anvil-pi-008", empId: "anvil-e-010", routing: "322271627", account: "7712334410", bankName: "Wells Fargo SA",    lastFour: "4410" },
    { id: "anvil-pi-009", empId: "anvil-e-011", routing: "021000021", account: "8834129011", bankName: "Bank of America SA",lastFour: "9011" },
    { id: "anvil-pi-010", empId: "anvil-e-012", routing: "111000025", account: "4521893012", bankName: "Chase Bank SA",     lastFour: "3012" },
  ];
  for (const p of payInfoRows) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeePayrollInfo).values({
      id: p.id,
      workspaceId: WS,
      employeeId: p.empId,
      bankRoutingNumber: p.routing,
      bankAccountNumber: p.account,
      bankName: p.bankName,
      bankAccountType: 'checking',
      directDepositEnabled: true,
      taxFilingStatus: 'single',
      federalAllowances: 1,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =====================================================================
  // 7. CHAT ROOMS
  // =====================================================================
  const rooms = [
    { id: "anvil-room-001", name: "General",    slug: "general",    desc: "Company-wide announcements and general discussion" },
    { id: "anvil-room-002", name: "Operations", slug: "ops",        desc: "Field operations, incidents, dispatch" },
    { id: "anvil-room-003", name: "Scheduling", slug: "scheduling", desc: "Shift scheduling and coverage requests" },
  ];
  for (const r of rooms) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(organizationChatRooms).values({
      id: r.id,
      workspaceId: WS,
      roomName: r.name,
      roomSlug: r.slug,
      description: r.desc,
      createdBy: 'anvil-owner-001',
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  console.log("[AnvilSeed] Core data seeded successfully.");
  return { success: true, message: "Anvil core data seeded" };
}
