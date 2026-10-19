#!/usr/bin/env node
// Generate local credentials without printing them or replacing an existing .env.
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--email" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1]))) {
    throw new Error("Usage: node scripts/generate_env.js [--email your-email@example.com]");
  }
  let text = fs.readFileSync(".env.example", "utf8");
  for (const key of ["POSTGRES_ADMIN_PASSWORD", "TASK_DB_PASSWORD", "EXPORTER_DB_PASSWORD", "PGADMIN_PASSWORD", "GRAFANA_ADMIN_PASSWORD"]) {
    text = text.replace(new RegExp(`^${key}=.*$`, "m"), () => `${key}=${randomBytes(32).toString("hex")}`);
  }
  if (args.length) text = text.replace(/^PGADMIN_EMAIL=.*$/m, () => `PGADMIN_EMAIL=${args[1]}`);
  fs.writeFileSync(".env", text, { flag: "wx", mode: 0o600 });
  console.log("Created .env with five independent random passwords. Credentials were not printed. Keep this file private.");
} catch (error) {
  console.error(error.code === "EEXIST" ? ".env already exists; nothing was overwritten." : error.message);
  process.exitCode = 1;
}
