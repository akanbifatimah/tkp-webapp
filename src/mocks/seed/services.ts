import type { ServiceKind } from "@/features/admin/config-types";

/**
 * The church's services and special events (PRD W-1 service names, W-13).
 * Times are church time (Central). Fictional dates for the special events.
 */
export type ServiceRecord = {
  id: string;
  name: string;
  shortName: string;
  kind: ServiceKind;
  day: number | null;
  time: string | null;
  startsOn: string | null;
  endsOn: string | null;
  shortForm: boolean;
  active: boolean;
  sortOrder: number;
  rowVer: number;
  updatedAt: string | null;
};

const base = { startsOn: null, endsOn: null, shortForm: false, active: true, rowVer: 1, updatedAt: null };

export const seedServices = (): ServiceRecord[] => [
  { ...base, id: "svc-1", name: "Sunday 1st Service", shortName: "1st service", kind: "weekly", day: 0, time: "09:30", sortOrder: 1 },
  { ...base, id: "svc-2", name: "Sunday 2nd Service", shortName: "2nd service", kind: "weekly", day: 0, time: "11:45", sortOrder: 2 },
  { ...base, id: "svc-3", name: "Tuesday Bible Study", shortName: "Bible study", kind: "weekly", day: 2, time: "19:00", sortOrder: 3 },
  { ...base, id: "svc-4", name: "Power Night", shortName: "Power Night", kind: "special", day: null, time: null, sortOrder: 4 },
  {
    ...base,
    id: "svc-5",
    name: "168 Hours of Praise",
    shortName: "168 HOP",
    kind: "special",
    day: null,
    time: null,
    startsOn: "2027-01-03",
    endsOn: "2027-01-09",
    shortForm: true,
    sortOrder: 5,
  },
  {
    ...base,
    id: "svc-6",
    name: "Cross Over",
    shortName: "Cross Over",
    kind: "special",
    day: null,
    time: null,
    startsOn: "2026-12-31",
    endsOn: "2027-01-01",
    shortForm: true,
    sortOrder: 6,
  },
  { ...base, id: "svc-7", name: "Saturday Prayer Breakfast", shortName: "Prayer breakfast", kind: "weekly", day: 6, time: "08:00", active: false, sortOrder: 7 },
];
