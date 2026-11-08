import { Kysely, PostgresDialect, type Generated } from "kysely";
import pg from "pg";

/** Kiểu các bảng (db/migrations). Viết tay; khi schema lớn hơn thì sinh bằng kysely-codegen. */
export interface Database {
  users: {
    id: Generated<string>;
    handle: string;
    display_name: string;
    phone: string | null;
    email: string | null;
    province: string | null;
    password_hash: string | null;
    email_verified_at: Date | null;
    failed_logins: Generated<number>;
    locked_until: Date | null;
    created_at: Generated<Date>;
  };
  user_identities: { provider: "google"; subject: string; user_id: string; created_at: Generated<Date> };
  sessions: {
    token_hash: string;
    user_id: string;
    user_agent: string | null;
    created_at: Generated<Date>;
    last_seen_at: Generated<Date>;
    expires_at: Date;
  };
  parts: {
    id: Generated<string>;
    kind: string;
    name: string;
    brand: string | null;
    release_year: number | null;
    specs: string; // jsonb
    scores: string; // jsonb
    scale_version: string | null;
  };
  machines: {
    id: Generated<string>;
    owner_id: string;
    name: Generated<string>;
    is_primary: Generated<boolean>;
    ram_gb: number;
    ram_channels: number;
    storage: string;
    pcie_gen: number;
    psu_w: number;
    resolution: number;
    verified_at: Date | null;
    last_scan_at: Generated<Date | null>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  machine_parts: {
    id: Generated<string>;
    machine_id: string;
    part_id: string | null;
    kind: "cpu" | "gpu" | "mainboard" | "ram" | "storage" | "psu";
    label: string;
    details: Generated<unknown>; // jsonb
    quantity: Generated<number>;
    status: Generated<"in_use" | "replaced" | "for_sale" | "sold">;
    verified_at: Date | null;
    replaced_at: Date | null;
    added_at: Generated<Date>;
  };
  listings: {
    id: Generated<string>;
    seller_id: string;
    part_id: string | null;
    machine_part_id: string | null;
    kind: "gpu" | "cpu" | "mainboard" | "ram" | "storage" | "psu" | "other";
    title: string | null;
    price_vnd: string | number; // bigint: pg trả về chuỗi
    condition: "new" | "like_new" | "used" | "for_parts";
    warranty_months: number | null;
    province: string | null;
    description: string | null;
    contact: string | null;
    status: Generated<"active" | "reserved" | "sold" | "hidden">;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    sold_at: Date | null;
    part_was_in_use: Generated<boolean>;
  };
  machine_scores: {
    machine_id: string;
    scale_version: string;
    gaming: number;
    render: number;
    ai: number;
    office: number;
    power: number;
    tier: string;
    badges: string[];
    computed_at: Generated<Date>;
  };
}

export type DB = Kysely<Database>;

export function createDb(url: string): DB {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 10 }) }) });
}
