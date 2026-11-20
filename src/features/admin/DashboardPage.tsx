import {
  CalendarClock,
  ChevronRight,
  ListChecks,
  Map as MapIcon,
  MessageSquareText,
  NotebookPen,
  PhoneCall,
  ScrollText,
  Search,
  Settings,
  Table2,
  UserCog,
  UserPlus,
  Users,
  LineChart as LineIcon,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tile } from "@/components/ui/Tile";
import { useAuth } from "@/features/auth/auth";
import { CELL_COLOR, pct } from "@/features/welcome/model";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import type { Permission } from "@/lib/permissions";
import { formatStamp, serviceDateShort } from "@/lib/time";
import { actionLabel } from "./audit-labels";
import { useDashboard } from "./queries";
import type { DashboardResponse } from "./types";

/**
 * Figma "TKP Hub" Admin Dashboard (node 125:4815): the Church Admin / Tech Admin
 * home, filled with TKP Connect data (PLAN §6). Sections follow permissions, so
 * each role sees its own dashboard (PRD 4.3).
 */
export function DashboardPage() {
  const { member } = useAuth();
  const q = useDashboard();
  const d = q.data;
  const first = member?.fullName.split(" ")[0];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back${first ? `, ${first}` : ""}`}
        tagline="May your stewardship today be a blessing to the global ministry."
      />

      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}

      {d ? <Tiles d={d} /> : <TilesSkeleton />}
      <QuickLinks />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">{d ? <Trend d={d} /> : <Skeleton className="h-96 w-full rounded-3xl" />}</div>
        <div className="xl:col-span-2">{d ? <Cells d={d} /> : <Skeleton className="h-96 w-full rounded-3xl" />}</div>
      </div>

      {d ? <Attention d={d} /> : <Skeleton className="h-72 w-full rounded-3xl" />}

      {d && (d.accounts || d.activity) ? (
        <div className="grid gap-6 xl:grid-cols-5">
          {d.accounts ? (
            <div className="xl:col-span-2">
              <Accounts a={d.accounts} />
            </div>
          ) : null}
          {d.activity ? (
            <div className={d.accounts ? "xl:col-span-3" : "xl:col-span-5"}>
              <Activity items={d.activity} />
            </div>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- tiles */

function Tiles({ d }: { d: DashboardResponse }) {
  const navigate = useNavigate();
  const { has } = useAuth();
  const t = d.tiles;
  const rate = pct(t.contacted48.done, t.contacted48.of);
  const firstSeen = t.firstSeen ? new Date(`${t.firstSeen}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <motion.div variants={stagger(0.05)} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Guests on record" value={t.guestsOnRecord} icon={<Users />} accent="teal" hint={firstSeen ? `Since ${firstSeen}` : undefined} />
      <Tile
        label="First-time guests this month"
        value={t.newThisMonth}
        icon={<UserPlus />}
        accent="blue"
        hint={`${t.newSameMonthLastYear} in the same month last year`}
      />
      <Tile
        label="Contacted within 48h"
        value={rate}
        format={(n) => `${Math.round(n)}%`}
        icon={<PhoneCall />}
        accent="rose"
        hint={t.contacted48.of ? `${t.contacted48.done} of ${t.contacted48.of} guests · last 30 days` : "No guests in the last 30 days"}
      />
      <Tile
        label="48h overdue"
        value={t.overdue48}
        icon={<CalendarClock />}
        accent="gold"
        critical={t.overdue48 > 0}
        hint={t.overdue48 ? "No first contact yet · open the work queue" : "Everyone reached in time"}
        onClick={has("connect.queue.view") ? () => navigate("/connect/queue") : undefined}
      />
    </motion.div>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- quick links */

type QuickLink = { label: string; to: string; icon: LucideIcon; permission: Permission; tone: string };

const LINKS: QuickLink[] = [
  { label: "Guest lookup", to: "/welcome/lookup", icon: Search, permission: "welcome.lookup.view", tone: "bg-[#fde2d6] text-[#c2552b]" },
  { label: "Work queue", to: "/connect/queue", icon: ListChecks, permission: "connect.queue.view", tone: "bg-gold-100 text-gold-800" },
  { label: "Log follow-up", to: "/connect/log", icon: NotebookPen, permission: "connect.log.view", tone: "bg-[#e9e3fb] text-[#6a4fc4]" },
  { label: "LCM Metrics", to: "/welcome/lcm", icon: MapIcon, permission: "welcome.lcm.view", tone: "bg-[#d6f3ee] text-[#167a6b]" },
  { label: "Scripts", to: "/connect/scripts", icon: MessageSquareText, permission: "connect.scripts.view", tone: "bg-[#f3e1dc] text-maroon-600" },
  { label: "Users", to: "/admin/users", icon: UserCog, permission: "admin.users", tone: "bg-[#e3ecfd] text-[#3563c9]" },
  { label: "Audit log", to: "/admin/audit", icon: ScrollText, permission: "admin.audit", tone: "bg-maroon-100 text-maroon-700" },
  { label: "Settings", to: "/admin/settings", icon: Settings, permission: "admin.settings", tone: "bg-cream-300 text-maroon-800" },
];

/** Figma "Quick Links", built from permissions. */
function QuickLinks() {
  const { has } = useAuth();
  const links = LINKS.filter((l) => has(l.permission));
  if (!links.length) return null;
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-maroon-950">Quick links</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="group flex h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-cream-200 px-2 text-center text-sm font-bold text-ink transition-[translate,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cream-300/70 hover:shadow-card"
            >
              <span className={cn("grid size-9 place-items-center rounded-full transition-transform duration-200 group-hover:scale-110", l.tone)} aria-hidden>
                <l.icon className="size-4.5" />
              </span>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ----------------------------------------------------------------- trend */

/** Validated pair (dataviz validator, light surface: all checks pass). Fixed order. */
const SERIES = [
  { key: "firstVisits", label: "First visits", color: "#9e2a33" },
  { key: "returnVisits", label: "Return visits", color: "#b08d22" },
] as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string, withYear = false) => `${MON[Number(m.slice(5, 7)) - 1]}${withYear ? ` ${m.slice(0, 4)}` : ""}`;

function Trend({ d }: { d: DashboardResponse }) {
  const [table, setTable] = useState(false);
  const rows = d.trend.map((r) => ({ ...r, label: monthLabel(r.month) }));
  const total = d.trend.reduce((a, r) => a + r.firstVisits + r.returnVisits, 0);
  const range = d.trend.length ? `${monthLabel(d.trend[0]!.month, true)} – ${monthLabel(d.trend[d.trend.length - 1]!.month, true)}` : "";
  const last = rows.length - 1;

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-navy-900">Guests per month</h2>
          <p className="mt-0.5 text-xs text-muted">
            {range} · {total.toLocaleString()} visits. A return visit is a guest's second or later form.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ul className="flex flex-wrap gap-3 text-xs font-bold text-ink">
            {SERIES.map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            aria-pressed={table}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-bold text-maroon-700 hover:bg-cream-50"
          >
            {table ? <LineIcon className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {table ? (
        <div className="scroll-warm mt-4 max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-muted">
              <tr>
                <th className="py-2 font-bold">Month</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-2 text-right font-bold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {d.trend.map((r) => (
                <tr key={r.month} className="border-t border-line">
                  <td className="py-1.5 font-semibold">{monthLabel(r.month, true)}</td>
                  <td className="py-1.5 text-right">{r.firstVisits}</td>
                  <td className="py-1.5 text-right">{r.returnVisits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 h-72" role="img" aria-label={`Guests per month, ${range}: first visits and return visits. Use the Table button for the numbers.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12, right: 56, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="#ebe3d6" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#ebe3d6" }} tick={{ fontSize: 11, fill: "#6b5f57", fontWeight: 600 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b5f57" }} />
              <Tooltip
                cursor={{ stroke: "#6b5f57", strokeWidth: 1, strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                  return active && row ? (
                    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-cream-50 shadow-lift">
                      <p className="mb-1 font-bold">{monthLabel(row.month, true)}</p>
                      {SERIES.map((s) => (
                        <p key={s.key} className="flex items-center gap-1.5">
                          <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                          {s.label}: <b>{row[s.key]}</b>
                        </p>
                      ))}
                    </div>
                  ) : null;
                }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: s.color }}
                  animationDuration={700}
                  label={(p: { index?: number; x?: number | string; y?: number | string }) =>
                    p.index === last ? (
                      <text key={`${s.key}-end`} x={Number(p.x) + 8} y={Number(p.y) + 4} fontSize={11} fontWeight={700} fill="#6b5f57">
                        {s.label.split(" ")[0]}
                      </text>
                    ) : (
                      <g key={`${s.key}-${p.index}`} />
                    )
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- cells */

function Cells({ d }: { d: DashboardResponse }) {
  const { has } = useAuth();
  const year = d.asOf.slice(0, 4);
  const max = Math.max(1, ...d.cells.map((c) => c.guests));
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-maroon-950">Cell groups</h2>
          <p className="mt-0.5 text-xs text-muted">Guests in {year} by home cell, from the ZIP map</p>
        </div>
        <Chip tone="gold">{year}</Chip>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {d.cells.map((c) => (
          <li key={c.cell} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 text-sm font-bold text-ink">
                <span className="size-2.5 rounded-full" style={{ background: CELL_COLOR[c.cell] }} aria-hidden />
                {c.cell === "N/A" ? "Not on cell map" : `${c.cell} cell`}
              </span>
              <span className="text-right">
                <span className="block text-sm font-bold text-ink tabular">
                  <CountUp value={c.guests} /> guests
                </span>
                <span className="block text-xs text-muted tabular">{c.active} active in Connect</span>
              </span>
            </div>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-cream-200" aria-hidden>
              <motion.span
                className="block h-full rounded-full"
                style={{ background: CELL_COLOR[c.cell] }}
                initial={{ width: 0 }}
                animate={{ width: `${(c.guests / max) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          </li>
        ))}
      </ul>
      {has("welcome.lcm.view") ? (
        <Link to="/welcome/lcm" className="mt-2 ml-auto flex w-fit items-center gap-1 text-sm font-bold text-maroon-800 hover:text-maroon-600">
          Open LCM Metrics <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- needs attention */

/** Figma "Happening This Week" list, used for what needs doing: 48h-overdue guests (BR-13). */
function Attention({ d }: { d: DashboardResponse }) {
  const { has } = useAuth();
  const canOpen = has("connect.log.view");
  return (
    <motion.section variants={fadeUp}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="font-display text-xl font-semibold text-maroon-950">
          Needs attention{" "}
          <span className="font-sans text-sm font-semibold text-muted">
            · {d.attentionTotal} {d.attentionTotal === 1 ? "guest" : "guests"} past 48 hours without a first contact
          </span>
        </h2>
        {has("connect.queue.view") ? (
          <Link to="/connect/queue" className="flex items-center gap-1 text-sm font-bold text-maroon-700 hover:text-maroon-600">
            Open work queue <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
        {d.attention.length ? (
          <ul className="divide-y divide-line">
            {d.attention.map((a) => {
              const since = a.hoursSince < 96 ? `${a.hoursSince} h` : `${Math.floor(a.hoursSince / 24)} days`;
              const day = new Date(`${a.serviceDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
              const body = (
                <>
                  <span className="grid w-12 shrink-0 place-items-center rounded-xl border border-maroon-200 bg-cream-50 py-1.5 leading-none" aria-hidden>
                    <span className="text-[11px] font-extrabold text-maroon-600">{day}</span>
                    <span className="mt-0.5 font-display text-lg font-semibold text-maroon-900">{a.serviceDate.slice(8)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{a.name}</span>
                    <span className="block text-xs font-bold text-crit sm:hidden">{since} since the form</span>
                    <span className="block truncate text-xs text-muted">
                      {serviceDateShort(a.serviceDate)} · {a.serviceType} · Church Office: {a.coName ?? "unassigned"} · Integration: {a.itName ?? "unassigned"}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <Chip tone="crit">{since} since the form</Chip>
                  </span>
                  {canOpen ? <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
                </>
              );
              return (
                <li key={a.connectId}>
                  {canOpen ? (
                    <Link to={`/connect/log/${a.connectId}`} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-cream-50 sm:px-5" aria-label={`Log follow-up for ${a.name}`}>
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-4 px-4 py-3.5 sm:px-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<PhoneCall />} title="Nobody is overdue">
            Every guest has had a first contact within 48 hours.
          </EmptyState>
        )}
      </div>
    </motion.section>
  );
}

/* ----------------------------------------------------------------- Tech Admin sections */

function Accounts({ a }: { a: NonNullable<DashboardResponse["accounts"]> }) {
  const stats = [
    { label: "Active", value: a.active, tone: "text-ok" },
    { label: "Temporary password", value: a.temporary, tone: "text-gold-800" },
    { label: "Deactivated", value: a.deactivated, tone: "text-muted" },
    { label: "Signed in this week", value: a.signedInThisWeek, tone: "text-maroon-800" },
  ];
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-maroon-950">Accounts</h2>
        <Link to="/admin/users" className="flex items-center gap-1 text-sm font-bold text-maroon-700 hover:text-maroon-600">
          Manage users <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-cream-100 p-4">
            <dt className="text-xs font-bold text-muted">{s.label}</dt>
            <dd className={cn("mt-1 font-display text-3xl font-semibold tabular", s.tone)}>
              <CountUp value={s.value} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Activity({ items }: { items: NonNullable<DashboardResponse["activity"]> }) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-maroon-950">Recent activity</h2>
        <Link to="/admin/audit" className="flex items-center gap-1 text-sm font-bold text-maroon-700 hover:text-maroon-600">
          Open audit log <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {items.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="font-bold text-ink">{e.actorName ?? "Someone"}</span> <span className="text-muted">{actionLabel(e.action).toLowerCase()}</span>
              {e.targetLabel ? <span className="block truncate text-xs text-muted">{e.targetLabel}</span> : null}
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted tabular">{formatStamp(e.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
