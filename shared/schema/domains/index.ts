// Master Domain Barrel — CoAIleague 16-Domain Architecture
// THE LAW: Every table, route, service, and API mount belongs to exactly one canonical domain.
// No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
//
// Domain map:
//   1. auth        — Auth & Identity
//   2. orgs        — Orgs & Workspaces
//   3. workforce   — Workforce
//   4. scheduling  — Scheduling
//   5. time        — Time & Attendance
//   6. payroll     — Payroll
//   7. billing     — Billing & Finance
//   8. trinity     — Trinity AI Engine
//   9. comms       — Communications
//  10. clients     — Clients & Sites
//  11. compliance  — Compliance & Documents
//  12. audit       — Audit & Platform Ops
//  13. support     — Support & HelpAI
//  14. sales       — Sales & CRM
//  15. ops         — Field Ops
//  16. sps         — SPS Document Management System (employee packets, contracts, negotiations)
//
// Full contract (tables + routes + services + mounts):
//   shared/schema/domains/DOMAIN_CONTRACT.ts

export { DOMAIN_CONTRACT, DOMAIN_NAMES } from './DOMAIN_CONTRACT';
export type { DomainName } from './DOMAIN_CONTRACT';

export * from './auth';
export * from './orgs';
export * from './workforce';
export * from './scheduling';
export * from './time';
export * from './payroll';
export * from './billing';
export * from './trinity';
export * from './comms';
export * from './clients';
export * from './compliance';
export * from './audit';
export * from './support';
export * from './sales';
export * from './ops';
export * from './sps';
export * from './training';
