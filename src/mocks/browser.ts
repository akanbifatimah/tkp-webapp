import { setupWorker } from "msw/browser";
import { adminHandlers } from "./handlers/admin";
import { authHandlers } from "./handlers/auth";
import { configHandlers } from "./handlers/config";
import { connectHandlers } from "./handlers/connect";
import { lcmHandlers } from "./handlers/lcm";
import { planHandlers } from "./handlers/plans";
import { growHandlers } from "./handlers/grow";
import { prayerHandlers } from "./handlers/prayer";
import { projectHandlers } from "./handlers/projects";
import { duplicateHandlers } from "./handlers/duplicates";
import { importHandlers } from "./handlers/imports";
import { reportHandlers } from "./handlers/reports";
import { qrHandlers } from "./handlers/qr";
import { welcomeHandlers } from "./handlers/welcome";

export const handlers = [...authHandlers, ...connectHandlers, ...welcomeHandlers, ...lcmHandlers, ...planHandlers, ...adminHandlers, ...configHandlers, ...qrHandlers, ...duplicateHandlers, ...importHandlers, ...reportHandlers, ...growHandlers, ...prayerHandlers, ...projectHandlers];

export async function startMocks() {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
}
