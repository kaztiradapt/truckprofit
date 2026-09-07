import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./test-database";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const manager = "00000000-0000-4000-8000-000000000002";
const org = "00000000-0000-4000-8000-000000000003";
const vehicle = "00000000-0000-4000-8000-000000000004";
const driver = "00000000-0000-4000-8000-000000000005";
const accessRole = "00000000-0000-4000-8000-000000000006";

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`
    insert into auth.users(id) values ('${owner}'), ('${manager}');
    insert into public.organizations(id,name,slug) values ('${org}','Test company','integrity-test');
    insert into public.organization_access_roles(id,organization_id,name,permissions) values ('${accessRole}','${org}','Editor',array['VIEW_DASHBOARD','MANAGE_VEHICLES','MANAGE_DRIVERS','MANAGE_TRIPS','MANAGE_FINANCE','VIEW_FINANCE']);
    insert into public.organization_memberships(organization_id,user_id,role,status,access_role_id) values
      ('${org}','${owner}','OWNER','ACTIVE',null), ('${org}','${manager}','MANAGER','ACTIVE','${accessRole}');
    insert into public.vehicles(id,organization_id,plate_number,display_name) values ('${vehicle}','${org}','TEST-01','Test vehicle');
    insert into public.drivers(id,organization_id,display_name,status) values ('${driver}','${org}','Test driver','ACTIVE');
  `);
}, 60_000);
afterAll(async () => { if (db) await db.close(); });

it("runs the two-company isolation smoke against PostgreSQL", async () => {
  await expect(db.exec(readFileSync(join(process.cwd(),"supabase/tests/tenant_isolation_smoke.sql"),"utf8"))).resolves.toBeDefined();
});

async function asUser(user: string, statement: string) {
  await db.exec(`begin; select set_config('request.jwt.claim.sub','${user}',true); set local role authenticated;`);
  try { return await db.exec(statement); } finally { await db.exec("rollback"); }
}

it("allows a manager to edit but forbids direct soft-delete and restoration", async () => {
  await expect(asUser(manager, `update public.vehicles set display_name='Updated' where id='${vehicle}'`)).resolves.toBeDefined();
  for (const [table, id] of [["vehicles",vehicle],["drivers",driver]]) {
    await expect(asUser(manager, `update public.${table} set deleted_at=now() where id='${id}'`)).rejects.toThrow("Delete records permission required");
  }
  await db.exec(`update public.vehicles set deleted_at=now() where id='${vehicle}'`);
  await expect(asUser(manager, `update public.vehicles set deleted_at=null where id='${vehicle}'`)).rejects.toThrow("Delete records permission required");
  await db.exec(`update public.vehicles set deleted_at=null where id='${vehicle}'`);
  await expect(asUser(owner, `update public.vehicles set deleted_at=now() where id='${vehicle}'`)).resolves.toBeDefined();
});

it("allows assignment after planned income, but locks it after driver activity", async () => {
  const result = await db.query<{id:string}>(`select set_config('request.jwt.claim.sub',$1,false)`, [owner]);
  void result;
  const created = await db.query<{id:string}>(`select public.create_trip_with_first_leg_and_income($1,$2,null,'Test trip','Origin','Destination','LOADED','2026-09-07',null,null,null,null,null,null,100,'Customer',1000,'KZT',null,null,1) id`, [org,vehicle]);
  const trip = created.rows[0].id;
  await expect(asUser(manager, `select public.update_trip_record('${org}','${trip}','${vehicle}','${driver}','Test trip','Origin','Destination','LOADED','2026-09-07',null,null,null,null,null,null,100)`)).resolves.toBeDefined();
  await db.exec(`insert into public.vehicle_status_records(organization_id,vehicle_id,trip_id,status_code,load_state,recorded_at,source) values ('${org}','${vehicle}','${trip}','IN_TRANSIT','LOADED',now(),'TELEGRAM')`);
  await expect(asUser(manager, `select public.update_trip_record('${org}','${trip}','${vehicle}','${driver}','Test trip','Origin','Destination','LOADED','2026-09-07',null,null,null,null,null,null,100)`)).rejects.toThrow("Trip facts already exist");
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
});

it("leases a chat, retries failed/stale updates and commits session state with acknowledgement", async () => {
  const first = "10000000-0000-4000-8000-000000000001";
  const second = "10000000-0000-4000-8000-000000000002";
  const claim = async (id:number,token:string) => (await db.query<{result:string}>("select public.claim_telegram_update($1,'test-chat',$2) result",[id,token])).rows[0].result;
  expect(await claim(100,first)).toBe("CLAIMED");
  expect(await claim(100,second)).toBe("BUSY");
  expect(await claim(101,second)).toBe("BUSY");
  await db.query("select public.complete_telegram_update(100,$1,true,true,$2)",[first,{step:"done"}]);
  expect(await claim(100,second)).toBe("PROCESSED");
  expect((await db.query<{state:unknown}>("select state from public.telegram_conversations where conversation_key='test-chat'")).rows[0].state).toEqual({step:"done"});
  expect(await claim(101,second)).toBe("CLAIMED");
  await db.query("select public.complete_telegram_update(101,$1,false,false,null)",[second]);
  expect(await claim(101,first)).toBe("CLAIMED");
  await db.exec("update public.telegram_update_logs set lease_expires_at=now()-interval '1 second' where telegram_update_id=101; update public.telegram_conversation_leases set expires_at=now()-interval '1 second' where conversation_key='test-chat'");
  expect(await claim(101,second)).toBe("CLAIMED");
  await expect(db.query("select public.complete_telegram_update(101,$1,true,true,'{}')",[first])).rejects.toThrow("Update lease expired");
  await db.query("select public.complete_telegram_update(101,$1,true,true,'{}')",[second]);
});

it("replays an expense result without a second expense after a session failure", async () => {
  const token = "20000000-0000-4000-8000-000000000001";
  const retryToken = "20000000-0000-4000-8000-000000000002";
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const created = await db.query<{id:string}>(`select public.create_trip_with_first_leg($1,$2,$3,'Retry test','Origin','Destination','LOADED','2026-09-07',null,null,null,null,null,null,100) id`,[org,vehicle,driver]);
  await db.exec(`insert into public.expense_categories(organization_id,code,display_name) values ('${org}','OTHER','Other')`);
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  const args={p_organization_id:org,p_driver_id:driver,p_trip_id:created.rows[0].id,p_category_code:"OTHER",p_amount:500,p_currency:"KZT",p_occurred_at:new Date().toISOString()};
  await db.query("select public.claim_telegram_update(200,'expense-chat',$1)",[token]);
  const effect = async (lease:string) => (await db.query<{id:string}>("select public.execute_telegram_operation(200,$1,'record_telegram_expense',$2) id",[lease,args])).rows[0].id;
  const first = await effect(token);
  await db.query("select public.complete_telegram_update(200,$1,false,false,null)",[token]);
  await db.query("select public.claim_telegram_update(200,'expense-chat',$1)",[retryToken]);
  expect(await effect(retryToken)).toBe(first);
  expect((await db.query<{count:number}>("select count(*)::int count from public.expenses where trip_id=$1",[created.rows[0].id])).rows[0].count).toBe(1);
  await db.query("select public.complete_telegram_update(200,$1,true,true,'{}')",[retryToken]);
  await expect(asUser(manager, `select public.claim_telegram_update(201,'forbidden','${token}')`)).rejects.toThrow("permission denied");
});
