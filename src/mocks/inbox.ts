/**
 * Mock mode only: the "email" the MFA step would have sent, so a demo can carry on.
 * A real backend sends an email and never returns the code. Kept free of other
 * imports so the sign-in page can read it without loading the mock database.
 */
type Delivery = { email: string; code: string; at: number };

let last: Delivery | null = null;
const listeners = new Set<() => void>();

export const mockInbox = {
  get: () => last,
  deliver(email: string, code: string) {
    last = { email, code, at: Date.now() };
    for (const l of listeners) l();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
