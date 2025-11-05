
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function addGpsColumns() {
  console.log("Adding GPS tracking columns to time_entries table...");
  
  try {
    // Add GPS columns if they don't exist
    await db.execute(sql`
      ALTER TABLE time_entries 
      ADD COLUMN IF NOT EXISTS clock_in_latitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS clock_in_longitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS clock_in_accuracy DECIMAL(8, 2),
      ADD COLUMN IF NOT EXISTS clock_in_ip_address VARCHAR,
      ADD COLUMN IF NOT EXISTS clock_out_latitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS clock_out_longitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS clock_out_accuracy DECIMAL(8, 2),
      ADD COLUMN IF NOT EXISTS clock_out_ip_address VARCHAR,
      ADD COLUMN IF NOT EXISTS job_site_latitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS job_site_longitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS job_site_address TEXT
    `);
    
    console.log("✅ GPS columns added successfully");
  } catch (error) {
    console.error("Error adding GPS columns:", error);
    throw error;
  }
}

addGpsColumns()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
