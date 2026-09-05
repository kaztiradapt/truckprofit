import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDirectory, name), "utf8"))
  .join("\n");

describe("tenant database security", () => {
  it("enables RLS for every table created in the public schema", () => {
    const tables = [...migrations.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(migrations, `public.${table} must enable RLS`).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
  });

  it("keeps private file buckets non-public", () => {
    expect(migrations).toContain("where id in ('expense-receipts', 'support-attachments')");
    expect(migrations).toContain("set public = false");
  });

  it("revokes direct anonymous access to tenant tables", () => {
    const revokedTables = migrations.match(/revoke all privileges on table([\s\S]+?)from anon;/i)?.[1] ?? "";
    const tables = [...migrations.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
    for (const table of tables) {
      expect(revokedTables, `public.${table} must be revoked from anon`).toContain(`public.${table}`);
    }
  });

  it("prevents team managers from delegating permissions they do not have", () => {
    expect(migrations).toContain("public.can_delegate_org_permissions(organization_id, permissions)");
    expect(migrations).toContain("public.can_assign_org_access_role(organization_id, access_role_id)");
    expect(migrations).toContain("public.can_manage_org_staff(organization_id, staff_id)");
    expect(migrations).toContain("public.has_org_permission(organization_id, 'DELETE_RECORDS')");
  });

  it("removes default public execution from security-definer functions", () => {
    expect(migrations).toContain("and proc.prosecdef");
    expect(migrations).toContain("revoke all on function %I.%I(%s) from public, anon");
    expect(migrations).toContain("alter function public.set_updated_at() set search_path = ''");
    expect(migrations).toContain("alter function public.validate_expense_relations() set search_path = ''");
    expect(migrations).toContain("alter function public.validate_income_relations() set search_path = ''");
  });
});
