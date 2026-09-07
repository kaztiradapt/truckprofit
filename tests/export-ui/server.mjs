// Isolated browser fixture: real production component/CSS, fake export transport.
// No Supabase credentials, user cookies or Telegram messages are used.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const bundle = await build({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReportExportControls} from './src/app/dashboard/report-export-controls';
if (location.search.includes('telegram')) window.Telegram={WebApp:{initData:'UI_TEST_ONLY'}};
createRoot(document.getElementById('root')).render(<main style={{padding:16,maxWidth:1100,margin:'0 auto'}}>
<h1>Отчёты</h1><div className="report-export-toolbar"><span><b>Скачать текущую выборку</b><small>Фильтры применяются к файлу.</small></span>
<ReportExportControls filters={{dateFrom:'2026-09-01',dateTo:'2026-09-07'}} disabled={false}/></div></main>);`,
  resolveDir: process.cwd(), loader:"tsx" }, bundle:true, write:false, format:"iife", jsx:"automatic", define:{"process.env.NODE_ENV":'"development"'} });
createServer(async (request,response) => {
  const url = new URL(request.url,"http://127.0.0.1:4187");
  if(url.pathname==='/app.js') {response.setHeader('Content-Type','text/javascript');return response.end(bundle.outputFiles[0].contents);}
  if(url.pathname==='/styles.css') {response.setHeader('Content-Type','text/css');return response.end(readFileSync('src/app/styles.css'));}
  if(url.pathname==='/api/reports/export') {
    if(request.method==='POST') {
      let raw=''; for await (const chunk of request) raw+=chunk;
      response.setHeader('Content-Type','application/json');
      return response.end(JSON.stringify({ok:true,message:'Отчёт отправлен файлом в ваш личный чат с ботом.',received:JSON.parse(raw)}));
    }
    const pdf=url.searchParams.get('format')==='pdf';
    response.setHeader('Content-Type',pdf?'application/pdf':'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition',`attachment; filename="fixture.${pdf?'pdf':'csv'}"`);
    return response.end(pdf?'%PDF-1.7 UI test fixture':'\uFEFFРейс;Доход\r\nТест;1000\r\n');
  }
  response.setHeader('Content-Type','text/html; charset=utf-8');
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
}).listen(4187,'127.0.0.1');
