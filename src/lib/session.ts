/**
 * Where the session token lives in the browser.
 *
 * Memory first, mirrored to sessionStorage so a page reload keeps you signed in
 * (closing the tab signs you out). TKP Connect keeps the token server-side
 * (API-A4); if the backend team switches to an httpOnly cookie, this module is
 * the only place to change.
 */
const KEY = "tkp.session";

let token: string | null = null;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const session = {
  get(): string | null {
    if (token === null) token = read();
    return token;
  },
  set(next: string | null) {
    token = next;
    try {
      if (next) sessionStorage.setItem(KEY, next);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* storage blocked: memory only */
    }
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
