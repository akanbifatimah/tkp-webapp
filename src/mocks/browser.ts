import { setupWorker } from "msw/browser";
import { authHandlers } from "./handlers/auth";
import { connectHandlers } from "./handlers/connect";

export const handlers = [...authHandlers, ...connectHandlers];

export async function startMocks() {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
}
