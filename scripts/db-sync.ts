import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function syncSchema() {
  console.log("CoAIleague DB Sync — Direct SQL approach (bypasses drizzle-kit push timeout)");
  console.log("=".repeat(70));

  const tableChecks = [
    { name: "pay_stubs", createSql: `CREATE TABLE IF NOT EXISTS pay_stubs (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id VARCHAR NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, payroll_run_id VARCHAR NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE, payroll_entry_id VARCHAR REFERENCES payroll_entries(id) ON DELETE SET NULL, employee_id VARCHAR NOT NULL REFERENCES employees(id) ON DELETE CASCADE, pay_period_start TIMESTAMP NOT NULL, pay_period_end TIMESTAMP NOT NULL, pay_date TIMESTAMP NOT NULL, gross_pay DECIMAL(12,2) NOT NULL, total_deductions DECIMAL(12,2) DEFAULT 0.00, net_pay DECIMAL(12,2) NOT NULL, deductions_breakdown JSONB, earnings_breakdown JSONB, employer_costs JSONB, pdf_url TEXT, pdf_storage_key TEXT, status VARCHAR DEFAULT 'generated', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), created_by VARCHAR REFERENCES users(id))`,
      indexes: [
        "CREATE INDEX IF NOT EXISTS pay_stubs_workspace_idx ON pay_stubs(workspace_id)",
        "CREATE INDEX IF NOT EXISTS pay_stubs_employee_idx ON pay_stubs(employee_id)",
        "CREATE INDEX IF NOT EXISTS pay_stubs_run_idx ON pay_stubs(payroll_run_id)",
        "CREATE INDEX IF NOT EXISTS pay_stubs_pay_date_idx ON pay_stubs(pay_date)",
      ]
    },
    { name: "deduction_configs", createSql: `CREATE TABLE IF NOT EXISTS deduction_configs (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id VARCHAR NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name VARCHAR NOT NULL, deduction_type VARCHAR NOT NULL, calc_method VARCHAR DEFAULT 'fixed', amount DECIMAL(10,2) NOT NULL, is_pre_tax BOOLEAN DEFAULT true, applies_to VARCHAR DEFAULT 'all', is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), created_by VARCHAR REFERENCES users(id), updated_by VARCHAR REFERENCES users(id))`,
      indexes: [
        "CREATE INDEX IF NOT EXISTS deduction_configs_workspace_idx ON deduction_configs(workspace_id)",
        "CREATE INDEX IF NOT EXISTS deduction_configs_active_idx ON deduction_configs(workspace_id, is_active)",
      ]
    },
    { name: "org_finance_settings", createSql: `CREATE TABLE IF NOT EXISTS org_finance_settings (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id VARCHAR NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE, accounting_mode VARCHAR DEFAULT 'native', quickbooks_sync_enabled BOOLEAN DEFAULT false, payroll_provider VARCHAR DEFAULT 'internal', payroll_provider_external_id VARCHAR, stripe_connect_account_id VARCHAR, default_payment_terms_days INTEGER DEFAULT 30, auto_generate_invoices BOOLEAN DEFAULT true, auto_send_invoices BOOLEAN DEFAULT false, invoice_prefix VARCHAR DEFAULT 'INV', invoice_footer_notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), updated_by VARCHAR REFERENCES users(id))`,
      indexes: [
        "CREATE INDEX IF NOT EXISTS org_finance_settings_workspace_idx ON org_finance_settings(workspace_id)",
      ]
    },
    { name: "payroll_exports", createSql: `CREATE TABLE IF NOT EXISTS payroll_exports (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id VARCHAR NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, payroll_run_id VARCHAR NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE, provider_type VARCHAR NOT NULL, export_format VARCHAR DEFAULT 'json', export_payload JSONB, storage_key TEXT, status VARCHAR DEFAULT 'pending', sent_at TIMESTAMP, acknowledged_at TIMESTAMP, external_batch_id VARCHAR, error_message TEXT, created_at TIMESTAMP DEFAULT NOW(), created_by VARCHAR REFERENCES users(id))`,
      indexes: [
        "CREATE INDEX IF NOT EXISTS payroll_exports_workspace_idx ON payroll_exports(workspace_id)",
        "CREATE INDEX IF NOT EXISTS payroll_exports_run_idx ON payroll_exports(payroll_run_id)",
        "CREATE INDEX IF NOT EXISTS payroll_exports_status_idx ON payroll_exports(status)",
      ]
    },
    { name: "payroll_provider_connections", createSql: `CREATE TABLE IF NOT EXISTS payroll_provider_connections (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id VARCHAR NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, provider VARCHAR NOT NULL, external_company_id VARCHAR, status VARCHAR DEFAULT 'pending', connection_metadata JSONB, last_sync_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), created_by VARCHAR REFERENCES users(id))`,
      indexes: [
        "CREATE INDEX IF NOT EXISTS payroll_provider_conn_workspace_idx ON payroll_provider_connections(workspace_id)",
        "CREATE INDEX IF NOT EXISTS payroll_provider_conn_provider_idx ON payroll_provider_connections(provider)",
      ]
    },
  ];

  for (const table of tableChecks) {
    try {
      const exists = await db.execute(sql.raw(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table.name}') as exists`
      ));
      const tableExists = (exists as any).rows?.[0]?.exists === true || (exists as any)[0]?.exists === true;

      if (tableExists) {
        console.log(`  [SKIP] ${table.name} — already exists`);
      } else {
        await db.execute(sql.raw(table.createSql));
        console.log(`  [CREATE] ${table.name} — created`);
      }

      for (const idx of table.indexes) {
        await db.execute(sql.raw(idx));
      }
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        console.log(`  [OK] ${table.name} — already exists`);
      } else {
        console.error(`  [ERROR] ${table.name}:`, err.message);
      }
    }
  }

  console.log("\nDB Sync complete.");
  process.exit(0);
}

syncSchema().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
