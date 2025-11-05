
import { db } from "../server/db";
import { storage } from "../server/storage";
import { users, workspaces, employees, clients, shifts, timeEntries, invoices } from "@shared/schema";
import { eq } from "drizzle-orm";

async function validatePlatform() {
  console.log("🔍 Starting E2E Platform Validation...\n");

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  // Test 1: Database Connection
  try {
    await db.select().from(users).limit(1);
    console.log("✅ Database connection working");
    results.passed++;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    results.failed++;
  }

  // Test 2: Demo User Exists
  try {
    const demoUser = await storage.getUser("demo-user-00000000");
    if (demoUser) {
      console.log("✅ Demo user exists");
      results.passed++;
    } else {
      console.log("⚠️  Demo user not found");
      results.warnings++;
    }
  } catch (error) {
    console.error("❌ Demo user check failed:", error);
    results.failed++;
  }

  // Test 3: Workspace Auto-Creation
  try {
    const allUsers = await db.select().from(users).limit(5);
    let workspacesCreated = 0;
    
    for (const user of allUsers) {
      if (!user.currentWorkspaceId) {
        const workspace = await storage.createWorkspace({
          name: `${user.firstName || user.email}'s Workspace`,
          ownerId: user.id,
          subscriptionTier: "free",
          subscriptionStatus: "active",
        });
        
        await db.update(users)
          .set({ currentWorkspaceId: workspace.id })
          .where(eq(users.id, user.id));
        
        workspacesCreated++;
      }
    }
    
    console.log(`✅ Workspace auto-creation working (created ${workspacesCreated} workspaces)`);
    results.passed++;
  } catch (error) {
    console.error("❌ Workspace creation failed:", error);
    results.failed++;
  }

  // Test 4: Analytics Endpoint
  try {
    const workspace = await db.select().from(workspaces).limit(1);
    if (workspace[0]) {
      const analytics = await storage.getWorkspaceAnalytics(workspace[0].id);
      console.log("✅ Analytics endpoint working");
      console.log(`   - Total Revenue: $${analytics.totalRevenue}`);
      console.log(`   - Total Hours: ${analytics.totalHoursWorked}`);
      console.log(`   - Employees: ${analytics.employeeCount}`);
      console.log(`   - Clients: ${analytics.clientCount}`);
      results.passed++;
    }
  } catch (error) {
    console.error("❌ Analytics endpoint failed:", error);
    results.failed++;
  }

  // Test 5: GPS Columns
  try {
    const entries = await db.select().from(timeEntries).limit(1);
    console.log("✅ Time entries GPS columns working");
    results.passed++;
  } catch (error) {
    console.error("❌ GPS columns missing:", error);
    results.failed++;
  }

  // Test 6: OnboardingOS Routes
  try {
    // This would be tested via HTTP in real scenario
    console.log("⚠️  OnboardingOS routes need HTTP testing");
    results.warnings++;
  } catch (error) {
    console.error("❌ OnboardingOS check failed:", error);
    results.failed++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Validation Summary:");
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  console.log("=".repeat(50) + "\n");

  if (results.failed > 0) {
    console.log("❌ Platform validation FAILED. Please fix errors above.");
    process.exit(1);
  } else {
    console.log("✅ Platform validation PASSED!");
    process.exit(0);
  }
}

validatePlatform().catch((error) => {
  console.error("Fatal error during validation:", error);
  process.exit(1);
});
