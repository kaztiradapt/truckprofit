import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/export-ui",
  use: { baseURL:"http://127.0.0.1:4187", channel:"chrome", headless:true },
  webServer: { command:"node tests/export-ui/server.mjs", url:"http://127.0.0.1:4187", reuseExistingServer:false },
  projects: [
    {name:"desktop",use:{viewport:{width:1366,height:900}}},
    {name:"mobile",use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  ],
});
