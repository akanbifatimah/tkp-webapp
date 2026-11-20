import type { AuditRow } from "../db";
import type { ConnectRecord } from "./guests";
import type { StaffRecord } from "./staff";

/**
 * Two weeks of fictional audit history, so the Audit log and the dashboard's
 * recent activity are not empty on first load. Deterministic: same rows every load
 * (relative to now). Newest first, like the live log.
 */
export function seedAudit(staff: StaffRecord[], connect: ConnectRecord[], now = Date.now()): AuditRow[] {
  let seed = 20261120;
  const rand = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;

  const active = staff.filter((s) => s.isActive && !s.mustChangePassword);
  const welcome = active.filter((s) => !s.roles.includes("tkp_member"));
  const callers = active.filter((s) => s.connectTeam);
  const guests = connect.slice(-120);
  const rows: AuditRow[] = [];
  let n = 0;
  const add = (at: number, actorId: string | null, action: string, target: string | null = null, meta?: AuditRow["meta"]) =>
    rows.push({ id: `seed-${++n}`, actorId, action, target, at: new Date(at).toISOString(), ...(meta ? { meta } : {}) });

  const HOUR = 3_600_000;
  for (let day = 14; day >= 1; day--) {
    // Midnight UTC of that day; +14–23 h UTC is roughly 8 am – 5 pm in Katy.
    const base = Math.floor((now - day * 24 * HOUR) / (24 * HOUR)) * 24 * HOUR;
    const sunday = new Date(base).getUTCDay() === 0;
    const sessions = sunday ? 9 : 4;
    for (let i = 0; i < sessions; i++) {
      const who = pick(sunday ? welcome : active);
      const t = Math.min(base + (14 + rand() * 9) * HOUR, now - HOUR);
      add(t, who.id, "sign_in");
      if (rand() < 0.5 && who.roles.some((r) => r !== "tkp_member")) {
        const g = pick(guests);
        add(t + 4 * 60_000, who.id, "welcome.search", JSON.stringify({ name: g.entry.lastName }));
        add(t + 5 * 60_000, who.id, "welcome.view", String(g.guestId));
      }
      if (callers.includes(who) && rand() < 0.7) {
        const g = pick(guests);
        add(t + 9 * 60_000, who.id, "connect.guest.view", String(g.connectId));
        add(t + 14 * 60_000, who.id, "connect.log.save", String(g.connectId));
      }
    }
    if (rand() < 0.35) add(Math.min(base + 16 * HOUR, now - HOUR), null, "sign_in_failed", "someone@example.com");
  }

  // A few admin changes, with before and after values (PRD F-5).
  add(now - 9 * 24 * HOUR, "u01", "user.update", "u10", {
    before: { connectTeam: "integration" },
    after: { connectTeam: "both" },
  });
  add(now - 6 * 24 * HOUR, "u01", "settings.update", "settings", {
    before: { resetRelay: null },
    after: { resetRelay: "Joy Ibekwe" },
  });
  add(now - 24 * HOUR - 2 * HOUR, "u01", "user.create", "u17", {
    after: { fullName: "New Volunteer", roles: ["church_office"], connectTeam: "church_office" },
  });

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}
