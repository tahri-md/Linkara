import { pool, query } from "./connection.js";
import bcrypt from "bcryptjs";

async function seedDatabase() {
  console.log("Starting database seeding...");

  try {
    const hashedPassword = await bcrypt.hash("password123", 10);
    const userResult = await query(
      `INSERT INTO users (email, password_hash, name, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, name`,
      ["test@example.com", hashedPassword, "Test User"],
    );

    let userId: string;
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      console.log("Created test user:", userResult.rows[0].email);
    } else {
      const existing = await query("SELECT id FROM users WHERE email = $1", [
        "test@example.com",
      ]);
      userId = existing.rows[0].id;
      console.log("Test user already exists");
    }

    const orgResult = await query(
      `INSERT INTO organizations (name, slug, owner_id, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, name, slug`,
      ["Test Organization", "test-org", userId],
    );

    let orgId: string;
    if (orgResult.rows.length > 0) {
      orgId = orgResult.rows[0].id;
      console.log("Created organization:", orgResult.rows[0].name);
    } else {
      const existing = await query(
        "SELECT id FROM organizations WHERE slug = $1",
        ["test-org"],
      );
      orgId = existing.rows[0].id;
      console.log("Organization already exists");
    }

    const memberResult = await query(
      `INSERT INTO org_members (org_id, user_id, role, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (org_id, user_id) DO NOTHING
       RETURNING id`,
      [orgId, userId, "owner"],
    );

    if (memberResult.rows.length > 0) {
      console.log("Added user to organization as owner");
    } else {
      console.log("User already member of organization");
    }

    const workflowDef = {
      version: "1.0",
      name: "Sample Deploy Workflow",
      jobs: [
        {
          id: "build",
          name: "Build Application",
          image: "node:18",
          steps: [
            {
              name: "Install dependencies",
              run: "npm install",
            },
            {
              name: "Build",
              run: "npm run build",
            },
            {
              name: "Run tests",
              run: "npm test",
            },
          ],
          environment: {
            NODE_ENV: "production",
          },
          timeout: 3600,
          retry: 2,
        },
        {
          id: "deploy",
          name: "Deploy to Production",
          depends_on: ["build"],
          image: "node:18",
          steps: [
            {
              name: "Deploy",
              run: "npm run deploy",
            },
          ],
          deployment_target: {
            type: "aws",
            service: "elastic-beanstalk",
            environment: "prod",
          },
        },
      ],
      notifications: {
        on_failure: ["slack"],
        on_success: ["slack"],
      },
    };

    const workflowResult = await query(
      `INSERT INTO workflows (org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (org_id, name) DO NOTHING
       RETURNING id, name`,
      [
        orgId,
        "Sample Deploy Workflow",
        "A sample workflow to demonstrate build and deployment",
        JSON.stringify(workflowDef),
        JSON.stringify({ github: { event: "push", branch: "main" } }),
        true,
        userId,
      ],
    );

    if (workflowResult.rows.length > 0) {
      console.log("Created sample workflow:", workflowResult.rows[0].name);
    } else {
      console.log("Sample workflow already exists");
    }

    console.log("\nDatabase seeding completed successfully!");
    console.log("\nSeed Data Summary:");
    console.log("   - Test User: test@example.com / password123");
    console.log("   - Organization: test-org");
    console.log("   - Sample Workflow: Sample Deploy Workflow");
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
