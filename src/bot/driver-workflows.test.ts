import { expect, it, vi } from "vitest";
import { createDriverBot } from "./driver-bot";
import type { ActiveTrip, DriverBotRepository } from "./repository";
import type { Update } from "grammy/types";
const trip: ActiveTrip = {
  id:"00000000-0000-4000-8000-000000000107",organizationId:"org",driverId:"driver",vehicleId:"vehicle",
  title:"Test route",currency:"RUB",originCity:"A",destinationCity:"B",originAddress:"A",destinationAddress:"B",
  originLatitude:null,originLongitude:null,destinationLatitude:null,destinationLongitude:null,latestStatusCode:null,
  assignmentToken:"00000000-0000-4000-8000-000000000108",assignmentResponse:"PENDING",
};
function setup() {
  let saved: object | undefined;
  let sequence=0;
  const driver={organizationId:"org",driverId:"driver",driverName:"Test",baseCurrency:"RUB"};
  const repository={
    processIncomingUpdate:vi.fn(async(_id:number,_key:string,next:()=>Promise<void>)=>next()),
    loadConversation:vi.fn(async()=>saved),
    saveConversation:vi.fn(async(_key:string,state:object)=>{saved=structuredClone(state);}),
    deleteConversation:vi.fn(async()=>{saved=undefined;}),
    syncTelegramUsername:vi.fn(async()=>{}),
    findDriverByTelegramUserId:vi.fn(async()=>driver),
    findOwnerByTelegramUserId:vi.fn(async()=>null),
    findStaffByTelegramUserId:vi.fn(async()=>null),
    findActiveTrip:vi.fn(async()=>trip),
    recordExpense:vi.fn(async()=>({expenseId:"expense"})),
    editDriverExpense:vi.fn(async()=>({expenseId:"expense"})),
    respondToAssignment:vi.fn(async()=>{}),
    listDriverExpenses:vi.fn(async()=>[]),
    findDriverExpense:vi.fn(async()=>null),
  };
  const bot=createDriverBot("123:test",repository as unknown as DriverBotRepository);
  bot.botInfo={id:123,is_bot:true,first_name:"Test",username:"test_bot",can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false,can_connect_to_business:false,has_main_web_app:false,has_topics_enabled:false,allows_users_to_create_topics:false,can_manage_bots:false,supports_join_request_queries:false};
  const sent:Array<{method:string;payload:Record<string,unknown>}>=[];
  bot.api.config.use(async(_prev,method,payload)=>{
    sent.push({method,payload:payload as Record<string,unknown>});
    if(method==="answerCallbackQuery") throw new Error("callback too old");
    return {ok:true,result:method==="sendMessage" ? {message_id:100+sequence,date:1,chat:{id:456,type:"private"},text:"reply"} : true} as never;
  });
  const send=async(text:string,callback=false,group=false)=>{
    const id=++sequence;
    const from={id:456,is_bot:false,first_name:"Test"};
    const message={message_id:id,date:1,chat:{id:group ? -1 : 456,type:group ? "group" : "private"},from,text};
    await bot.handleUpdate((callback ? {update_id:id,callback_query:{id:String(id),from,chat_instance:"test",message,data:text}}
      : {update_id:id,message}) as Update);
  };
  return {repository,sent,send};
}
it("runs currency wizard, back, preview and save through actual bot handlers even when callback acknowledgement expires",async()=>{
  const {send,repository,sent}=setup();
  await send("menu:expense",true);
  await send("expense:category:OTHER",true);
  await send("expense:currency:USD",true);
  await send("10");
  await send("expense:back",true);
  await send("20");
  await send("90");
  await send("1000");
  expect(repository.recordExpense).not.toHaveBeenCalled();
  expect(JSON.stringify(sent)).toContain("Сохранить расход");
  await send("expense:confirm",true);
  expect(repository.recordExpense).toHaveBeenCalledWith(expect.objectContaining({amountMinor:2000,originalCurrency:"USD",currency:"RUB",exchangeRate:90,odometerKm:1000}));
  await send("expense:confirm",true);
  expect(repository.recordExpense).toHaveBeenCalledTimes(1);
});
it("shows acceptance controls and saves refusal reason",async()=>{
  const {send,sent,repository}=setup();
  await send("menu:trip",true);
  expect(JSON.stringify(sent)).toContain("assignment:accept:"+trip.assignmentToken);
  await send("assignment:decline:"+trip.assignmentToken,true);
  await send("Автомобиль в ремонте");
  expect(repository.respondToAssignment).toHaveBeenCalledWith(expect.objectContaining({driverId:"driver"}),trip.assignmentToken,"DECLINED","Автомобиль в ремонте");
});
it("does not expose driver records in a group",async()=>{
  const {send,repository}=setup();
  await send("expenses:page:0",true,true);
  expect(repository.findDriverByTelegramUserId).not.toHaveBeenCalled();
  expect(repository.listDriverExpenses).not.toHaveBeenCalled();
});
