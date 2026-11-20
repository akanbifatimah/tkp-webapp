import { setupWorker } from "msw/browser";
import { adminHandlers } from "./handlers/admin";
import { authHandlers } from "./handlers/auth";
import { connectHandlers } from "./handlers/connect";
import { lcmHandlers } from "./handlers/lcm";
import { planHandlers } from "./handlers/plans";
import { welcomeHandlers } from "./handlers/welcome";

export const handlers = [...authHandlers, ...connectHandlers, ...welcomeHandlers, ...lcmHandlers, ...planHandlers, ...adminHandlers];

export async function startMocks() {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
}
