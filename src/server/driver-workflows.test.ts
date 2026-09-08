import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./test-database";
let db: PGlite;
const org="00000000-0000-4000-8000-000000000103";
const driver="00000000-0000-4000-8000-000000000105";
const vehicle="00000000-0000-4000-8000-000000000104";
const trip="00000000-0000-4000-8000-000000000107";
const token="00000000-0000-4000-8000-000000000108";
let update=1000;
beforeAll(async()=>{
  db=await createTestDatabase();
  await db.query("insert into public.organizations(id,name,slug,base_currency) values($1,'Test','driver-workflow','RUB')",[org]);
  await db.query("insert into public.vehicles(id,organization_id,plate_number,display_name) values($1,$2,'TEST','Test')",[vehicle,org]);
  await db.query("insert into public.drivers(id,organization_id,display_name,status,telegram_user_id) values($1,$2,'Driver','ACTIVE',123456)",[driver,org]);
  await db.query("insert into public.trips(id,organization_id,vehicle_id,driver_id,title,status,started_at) values($1,$2,$3,$4,'Test','ACTIVE',now())",[trip,org,vehicle,driver]);
  await db.query("insert into public.expense_categories(organization_id,code,display_name) values($1,'OTHER','Other'),($1,'FUEL','Fuel')",[org]);
},60000);
afterAll(async()=>{if(db)await db.close();});
async function begin(chat="123456") {
  const id=++update;
  await db.query("select public.claim_telegram_update($1,$2,$3)",[id,chat,token]);
  return id;
}
async function end(id:number) {await db.query("select public.complete_telegram_update($1,$2,true,false,null)",[id,token]);}
async function action(id:number,name:string,args:object) {
  return (await db.query<{id:string}>("select public.execute_driver_workflow($1,$2,$3,$4) id",[id,token,name,{organizationId:org,driverId:driver,tripId:trip,...args}])).rows[0].id;
}
const receipt={categoryCode:"OTHER",originalCurrency:"USD",originalAmount:12.34,exchangeRate:90.12345678,occurredAt:"2026-09-08T10:00:00Z"};
it("stores original and base amount atomically, replay does not duplicate",async()=>{
  const id=await begin();
  const expense=await action(id,"create_expense",receipt);
  expect(await action(id,"create_expense",receipt)).toBe(expense);
  const row=(await db.query<{amount:string;currency:string;receipt_amount:string;receipt_currency:string;reporting_amount_minor:number}>("select * from public.expenses where id=$1",[expense])).rows[0];
  expect(Number(row.amount)).toBe(1112.12); expect(row.currency).toBe("RUB");
  expect(Number(row.receipt_amount)).toBe(12.34); expect(row.receipt_currency).toBe("USD");
  expect(Number(row.reporting_amount_minor)).toBe(111212);
  await end(id);
});
it("rejects invalid money, rates, currency and a different Telegram chat",async()=>{
  const id=await begin();
  for(const change of [{originalCurrency:"BTC"},{originalAmount:0},{originalAmount:"NaN"},{exchangeRate:"Infinity"},{exchangeRate:0},{exchangeRate:0.000000001},{originalAmount:1.234},{originalAmount:999999999,exchangeRate:1000000}]) {
    await expect(action(id,"create_expense",{...receipt,...change})).rejects.toThrow();
  }
  await end(id);
  const wrong=await begin("999999");
  await expect(action(wrong,"create_expense",receipt)).rejects.toThrow("Driver identity");
  await end(wrong);
});
it("corrects own active expense and audits before/after, rejects stale or foreign edits",async()=>{
  let id=await begin();
  const expense=await action(id,"create_expense",receipt); await end(id);
  const get=async()=>(await db.query<{updated_at:string;amount:string}>("select updated_at::text,amount from public.expenses where id=$1",[expense])).rows[0];
  const original=await get();
  id=await begin();
  const args={...receipt,expenseId:expense,expectedUpdatedAt:original.updated_at,originalAmount:20};
  await action(id,"edit_expense",args);
  expect(await action(id,"edit_expense",args)).toBe(expense);
  await end(id);
  expect(Number((await get()).amount)).toBe(1802.47);
  const audits=await db.query<{before_data:Record<string,unknown>;after_data:Record<string,unknown>}>("select before_data,after_data from public.audit_events where entity_id=$1 and action='DRIVER_CORRECTED'",[expense]);
  expect(audits.rows).toHaveLength(1);
  expect(Number(audits.rows[0].before_data.amount)).toBe(1112.12);
  expect(Number(audits.rows[0].after_data.amount)).toBe(1802.47);
  id=await begin();
  await expect(action(id,"edit_expense",args)).rejects.toThrow("Expense changed");
  await expect(action(id,"edit_expense",{...args,expenseId:vehicle})).rejects.toThrow("Expense is unavailable");
  await expect(action(id,"edit_expense",{...args,organizationId:vehicle})).rejects.toThrow("Driver identity");
  await db.query("update public.trips set status='COMPLETED',completed_at=now() where id=$1",[trip]);
  await expect(action(id,"edit_expense",{...args,expectedUpdatedAt:(await get()).updated_at})).rejects.toThrow("No active trip");
  await db.query("update public.trips set status='ACTIVE',completed_at=null where id=$1",[trip]);
  await end(id);
});
it("accepts a specific assignment, preserves driving status and rejects stale buttons",async()=>{
  const assignment=async()=>(await db.query<{assignment_token:string;assignment_response:string}>("select assignment_token,assignment_response from public.trips where id=$1",[trip])).rows[0];
  const before=await assignment();
  let id=await begin();
  await action(id,"respond_assignment",{assignmentToken:before.assignment_token,response:"ACCEPTED"});
  expect((await assignment()).assignment_response).toBe("ACCEPTED");
  expect((await db.query("select * from public.vehicle_status_records where trip_id=$1",[trip])).rows).toHaveLength(0);
  await end(id);
  id=await begin();
  await expect(action(id,"respond_assignment",{assignmentToken:before.assignment_token,response:"DECLINED",reason:"Отказ"})).rejects.toThrow("already answered");
  await db.query("update public.trips set driver_id=null where id=$1",[trip]);
  await db.query("update public.trips set driver_id=$2 where id=$1",[trip,driver]);
  expect((await assignment()).assignment_response).toBe("PENDING");
  await expect(action(id,"respond_assignment",{assignmentToken:before.assignment_token,response:"ACCEPTED"})).rejects.toThrow("no longer available");
  const fresh=await assignment();
  await expect(action(id,"respond_assignment",{assignmentToken:fresh.assignment_token,response:"DECLINED",reason:""})).rejects.toThrow("reason");
  await action(id,"respond_assignment",{assignmentToken:fresh.assignment_token,response:"DECLINED",reason:"Автомобиль в ремонте"});
  expect((await assignment()).assignment_response).toBe("DECLINED");
  await end(id);
});
it("denies direct authenticated access to driver mutation RPC",async()=>{
  await db.exec("set role authenticated");
  try {await expect(db.query("select public.execute_driver_workflow(1,$1,'create_expense','{}')",[token])).rejects.toThrow("permission denied");}
  finally {await db.exec("reset role");}
});

it("uses the company base for all receipt currencies and never changes odometer facts during correction",async()=>{
  for (const currency of ["KZT","RUB","USD","CNY","UZS"]) {
    const id=await begin();
    const expense=await action(id,"create_expense",{...receipt,originalCurrency:currency,originalAmount:100,exchangeRate:2});
    const row=(await db.query<{amount:string;receipt_fx_rate:string}>("select amount,receipt_fx_rate from public.expenses where id=$1",[expense])).rows[0];
    expect(Number(row.amount)).toBe(currency==="RUB" ? 100 : 200);
    expect(Number(row.receipt_fx_rate)).toBe(currency==="RUB" ? 1 : 2);
    await end(id);
  }
  let id=await begin();
  const args={...receipt,categoryCode:"FUEL",originalAmount:100,fuelLitres:10,odometerKm:5000};
  const expense=await action(id,"create_expense",args); await end(id);
  const updated=(await db.query<{at:string}>("select updated_at::text at from public.expenses where id=$1",[expense])).rows[0].at;
  id=await begin();
  await action(id,"edit_expense",{...args,expenseId:expense,expectedUpdatedAt:updated,fuelLitres:12,odometerKm:1});
  const records=(await db.query<{value_km:string}>("select value_km from public.odometer_records where trip_id=$1",[trip])).rows;
  expect(records).toHaveLength(1); expect(Number(records[0].value_km)).toBe(5000);
  expect(Number((await db.query<{odometer_km:string}>("select odometer_km from public.expenses where id=$1",[expense])).rows[0].odometer_km)).toBe(5000);
  await end(id);
});

it("does not allow a signed-in owner to forge the driver's acceptance",async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[driver]);
  try { await expect(db.query("update public.trips set assignment_response='ACCEPTED' where id=$1",[trip])).rejects.toThrow("Only the assigned driver"); }
  finally { await db.exec("select set_config('request.jwt.claim.sub','',false)"); }
});
