import { HttpResponse, http } from "msw";
import { checkPassword } from "@/lib/password-policy";
import { audit, db } from "../db";
import { authenticate, fail, issueToken, latency, path, toMember } from "../http";
import { needsMfa, rememberDevice, resendMfa, startMfa, trustedDevice, verifyMfa } from "../mfa";
import type { StaffRecord } from "../seed/staff";
import { mySignature, removeMySignature, saveMySignature } from "../signatures";
import { send } from "./connect";

/** A full session, once every sign-in step has passed. */
function signedIn(user: StaffRecord, extra: { device?: { token: string; expiresAt: string }; trusted?: string } = {}) {
  const { token, expiresAt } = issueToken(user.id);
  user.lastSignInAt = new Date().toISOString();
  audit(user.id, "sign_in", null, extra.trusted ? { after: { rememberedDevice: extra.trusted } } : undefined);
  return HttpResponse.json({ token, expiresAt, member: toMember(user), ...(extra.device ? { device: extra.device } : {}) });
}

/** API-A1: one message for every failure. */
const INVALID = "Invalid email or password";

export const authHandlers = [
  http.post(path("/auth/sign-in"), async ({ request }) => {
    await latency();
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string; deviceToken?: string } | null;
    const email = body?.email?.trim().toLowerCase() ?? "";
    const user = db.staff.find((u) => u.email === email);
    if (!user || !user.isActive || body?.password !== user.password) {
      audit(null, "sign_in_failed", email || null);
      return fail(401, "INVALID_CREDENTIALS", INVALID);
    }
    // PRD A-2: staff prove it is them with a one-time code before a session exists.
    // A device remembered in the last 30 days skips the code (TKP, 2026-11-26).
    if (needsMfa(user)) {
      const device = trustedDevice(user, body?.deviceToken);
      if (device) return signedIn(user, { trusted: device.label });
      return HttpResponse.json({ mfa: startMfa(user) });
    }
    return signedIn(user);
  }),

  http.post(path("/auth/mfa/verify"), async ({ request }) => {
    await latency();
    const body = (await request.json().catch(() => null)) as { ticket?: string; code?: string; remember?: boolean; deviceLabel?: string } | null;
    const r = verifyMfa(body?.ticket ?? "", body?.code ?? "");
    if (!r.ok) return send(r);
    return signedIn(r.body.user, body?.remember ? { device: rememberDevice(r.body.user, body.deviceLabel ?? "") } : {});
  }),

  http.post(path("/auth/mfa/resend"), async ({ request }) => {
    await latency();
    const body = (await request.json().catch(() => null)) as { ticket?: string } | null;
    return send(resendMfa(body?.ticket ?? ""));
  }),

  http.post(path("/auth/token/renew"), ({ request }) => {
    const auth = authenticate(request, { allowMustChange: true });
    if (auth instanceof Response) return auth;
    const { token, expiresAt } = issueToken(auth.user.id, auth.claims.sid);
    return HttpResponse.json({ token, expiresAt, member: toMember(auth.user) });
  }),

  http.post(path("/auth/sign-out"), ({ request }) => {
    const auth = authenticate(request, { allowMustChange: true });
    if (!(auth instanceof Response)) audit(auth.user.id, "sign_out");
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(path("/me"), async ({ request }) => {
    await latency();
    const auth = authenticate(request, { allowMustChange: true });
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ member: toMember(auth.user) });
  }),

  /** My signature, for certificates (docs/API.md §16). */
  http.get(path("/me/signature"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(mySignature(auth.user));
  }),
  http.put(path("/me/signature"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(saveMySignature(auth.user, ((await request.json().catch(() => null)) ?? {}) as { signature?: unknown }));
  }),
  http.delete(path("/me/signature"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(removeMySignature(auth.user));
  }),

  /** TKP Connect auth-change-password. On success every session of this person ends (API-A6). */
  http.post(path("/auth/change-password"), async ({ request }) => {
    await latency();
    const auth = authenticate(request, { allowMustChange: true });
    if (auth instanceof Response) return auth;
    const body = (await request.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
    const current = body?.currentPassword ?? "";
    const next = body?.newPassword ?? "";
    if (!current || !next) return fail(400, "BAD_REQUEST", "Current and new password are required");
    if (next.length > 200) return fail(422, "VALIDATION_FAILED", "That password is too long", { newPassword: ["That password is too long"] });

    const policy = checkPassword(next);
    if (!policy.ok) {
      return HttpResponse.json(
        {
          error: {
            code: "PASSWORD_RULES",
            message: "That password does not meet the requirements",
            fields: { newPassword: policy.failed.map((f) => f.label) },
            failed: policy.failed,
          },
        },
        { status: 422 },
      );
    }
    // 403, not 401: they ARE signed in; a 401 would end the session and lose the form.
    if (current !== auth.user.password) {
      return fail(403, "WRONG_PASSWORD", "Your current password is not correct", {
        currentPassword: ["Your current password is not correct"],
      });
    }
    if (next === auth.user.password) {
      return fail(422, "SAME_PASSWORD", "That is already your password. Please choose a different one.", {
        newPassword: ["That is already your password. Please choose a different one."],
      });
    }
    auth.user.password = next;
    auth.user.mustChangePassword = false;
    auth.user.sessionsRevokedAt = Date.now() + 1;
    audit(auth.user.id, "password.change");
    return HttpResponse.json({ signedOut: true });
  }),

  http.get(path("/settings/public"), () =>
    HttpResponse.json({ resetContact: db.settings.resetContact, resetRelay: db.settings.resetRelay, idleMinutes: db.settings.idleMinutes }),
  ),
];
