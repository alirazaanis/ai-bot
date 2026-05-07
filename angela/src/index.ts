import { loadConfig } from "./config.js";
import { startEmailAutoReplyLoop } from "./mail/emailAutoReplyLoop.js";
import { createApp, listenApp } from "./server.js";

const cfg = loadConfig();
const { app, orchestrator } = createApp(cfg);
listenApp(app, cfg);
startEmailAutoReplyLoop(cfg, orchestrator);
