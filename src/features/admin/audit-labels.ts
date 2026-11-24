import type { AuditCategory } from "./types";

/** Plain words for each audit action. Unknown actions show their key. */
export const ACTION_LABEL: Record<string, string> = {
  sign_in: "Signed in",
  sign_in_failed: "Failed sign-in",
  sign_out: "Signed out",
  "password.change": "Changed their password",
  "mfa.code_sent": "Sign-in code sent",
  "mfa.failed": "Wrong sign-in code",
  "welcome.search": "Searched guests",
  "welcome.view": "Opened a guest record",
  "welcome.entry.view": "Viewed a form entry",
  "welcome.entry.export": "Exported a guest PDF",
  "welcome.lcm.view": "Opened LCM Metrics",
  "welcome.lcm.export": "Exported the LCM report",
  "welcome.cellmap.set": "Changed the cell map",
  "welcome.cellmap.remove": "Took a ZIP off the cell map",
  "welcome.service.create": "Added a service",
  "welcome.service.update": "Changed a service",
  "welcome.service.retire": "Retired a service",
  "welcome.service.restore": "Restored a service",
  "welcome.service.delete": "Deleted a service",
  "welcome.service.reorder": "Reordered the guest form services",
  "welcome.qr.create": "Added a QR code",
  "welcome.qr.legacy": "Registered a printed QR code",
  "welcome.qr.update": "Changed a QR code",
  "welcome.qr.dates": "Changed a QR code's dates",
  "welcome.qr.renew": "Renewed an expired QR code",
  "welcome.qr.publish": "Turned on a QR code",
  "welcome.qr.pause": "Paused a QR code",
  "welcome.qr.resume": "Resumed a QR code",
  "welcome.qr.delete": "Deleted a QR code",
  "welcome.qr.print": "Printed QR codes",
  "connect.assign": "Assigned a guest",
  "connect.guest.view": "Opened a guest in Connect",
  "connect.log.save": "Saved a follow-up log",
  "connect.journey.view": "Opened a guest journey",
  "connect.metrics.view": "Opened Team metrics",
  "user.create": "Added a user",
  "user.update": "Changed a user",
  "user.deactivate": "Deactivated a user",
  "user.reactivate": "Reactivated a user",
  "user.password.reset": "Reset a password",
  "user.sessions.revoke": "Signed a user out everywhere",
  "settings.update": "Changed settings",
};

export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

/** Tone for the action chip: red for failures and removals, gold for exports and admin changes. */
export function actionTone(a: string): "crit" | "gold" | "maroon" | "neutral" {
  if (["sign_in_failed", "mfa.failed", "user.deactivate", "user.sessions.revoke", "welcome.cellmap.remove", "welcome.service.delete", "welcome.service.retire", "welcome.qr.delete", "welcome.qr.pause"].includes(a)) return "crit";
  if (a.endsWith(".export") || a.startsWith("user.") || a.startsWith("settings.") || a.startsWith("welcome.cellmap.") || a.startsWith("welcome.service.") || a.startsWith("welcome.qr.")) return "gold";
  if (a.startsWith("sign_") || a.startsWith("mfa.") || a.startsWith("password.")) return "neutral";
  return "maroon";
}

export const CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "sign-in", label: "Sign-in" },
  { id: "welcome", label: "Welcome" },
  { id: "connect", label: "Connect" },
  { id: "exports", label: "Exports" },
  { id: "users", label: "Users and roles" },
  { id: "settings", label: "Settings" },
];

/** Field names in before/after values, in plain words. */
export const FIELD_LABEL: Record<string, string> = {
  fullName: "Name",
  email: "Email",
  phone: "Phone",
  roles: "Roles",
  connectTeam: "Follow-up team",
  isActive: "Active",
  resetContact: "Password reset contact",
  resetRelay: "Second contact",
  idleMinutes: "Idle sign-out (minutes)",
  forcePasswordChange: "Temporary passwords must be changed",
  auditRetentionDays: "Keep audit log (days)",
  cell: "Cell group",
  recalculated: "Entries recalculated",
  name: "Name",
  shortName: "Chart label",
  kind: "Kind",
  day: "Day",
  time: "Start time",
  startsOn: "First day on the form",
  endsOn: "Last day on the form",
  shortForm: "Short form",
  active: "Active",
  order: "Order on the form",
  renamedEntries: "Past entries renamed",
  destination: "Opens",
  service: "Service",
  activeFrom: "Active from",
  expiresAt: "Expires",
  state: "State",
  note: "Note",
  caption: "Caption",
  legacyUrl: "Printed address",
  codes: "Codes",
  layout: "Layout",
  copies: "Copies",
};
