import type { ConnectTeam, Role } from "./permissions";

/** The signed-in person (TKP Connect API-A8, extended with roles[] for the PRD's role switcher). */
export type Member = {
  id: string;
  fullName: string;
  email: string;
  /** Every role the person holds. TKP Connect people have exactly one. */
  roles: Role[];
  connectTeam: ConnectTeam | null;
  isTeamAdmin: boolean;
  mustChangePassword: boolean;
};

/** Settings any visitor to the sign-in page may see. */
export type PublicSettings = {
  /** Who resets passwords (UI-S1: no self-service reset). */
  resetContact: string;
  /** Optional second person who passes the message on. */
  resetRelay: string | null;
};

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };
