export type RegStatus = 'registered' | 'cancelled';

export interface Member {
  id: string;
  member_code: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sport {
  id: string;
  sport_name: string;
  target_count: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  member_id: string;
  sport_id: string;
  registration_status: RegStatus;
  registered_at: string;
  updated_at: string;
  created_by: string | null;
}

export type AuditAction =
  | 'REGISTER'
  | 'RE_REGISTER'
  | 'CANCEL'
  | 'MOVE'
  | 'MEMBER_ADD'
  | 'MEMBER_UPDATE'
  | 'MEMBER_ACTIVE'
  | 'SPORT_ADD'
  | 'SPORT_UPDATE'
  | 'SPORT_ACTIVE'
  | 'RESET';

export interface AuditLog {
  id: string;
  action: AuditAction;
  member_id: string | null;
  sport_id: string | null;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export interface Snapshot {
  members: Member[];
  sports: Sport[];
  registrations: Registration[];
  logs: AuditLog[];
}

export interface RegisterResult {
  added: number;
  skipped: number;
}

/** Every write goes through this interface — implemented by Demo (localStorage) and Supabase. */
export interface DataSource {
  readonly mode: 'demo' | 'supabase';
  load(): Promise<Snapshot>;
  /** Calls onChange when data changed elsewhere (other tab / other user). Returns unsubscribe. */
  subscribe(onChange: () => void, onStatus?: (online: boolean) => void): () => void;
  registerMembers(sportId: string, memberIds: string[], actor: string, allowOver: boolean): Promise<RegisterResult>;
  cancelRegistration(memberId: string, sportId: string, actor: string): Promise<void>;
  moveRegistration(memberId: string, fromSportId: string, toSportId: string, actor: string, allowOver: boolean): Promise<void>;
  addMember(fullName: string, actor: string): Promise<void>;
  updateMember(id: string, fullName: string, actor: string): Promise<void>;
  setMemberActive(id: string, active: boolean, actor: string): Promise<void>;
  addSport(name: string, target: number, actor: string): Promise<void>;
  updateSport(id: string, name: string, target: number, actor: string): Promise<void>;
  setSportActive(id: string, active: boolean, actor: string): Promise<void>;
  resetRegistrations(actor: string): Promise<number>;
  /** Demo only: restore the original seed data. */
  factoryReset?(): Promise<void>;
}
