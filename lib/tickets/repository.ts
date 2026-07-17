import type { Pool as PgPool } from "pg";
import { getMockTickets } from "./mock-data";
import type { Ticket } from "./types";

export type TicketDataSource = "mock" | "postgres";

interface CachedTickets {
  expiresAt: number;
  value?: Ticket[];
  pending?: Promise<Ticket[]>;
}

let cache: CachedTickets | undefined;
let pool: PgPool | undefined;

function numberFromEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function getDataSource(): TicketDataSource {
  return process.env.DATA_SOURCE?.toLowerCase() === "postgres" ? "postgres" : "mock";
}

export function getTerminalStatuses() {
  return (process.env.TERMINAL_STATUSES ?? "Resuelto,Cerrado,Cancelado")
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase("es"))
    .filter(Boolean);
}

export function quoteIdentifierPath(value: string) {
  const segments = value.split(".");
  if (!segments.length || segments.some((segment) => !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(segment))) {
    throw new Error(`Identificador PostgreSQL inválido: ${value}`);
  }
  return segments.map((segment) => `"${segment}"`).join(".");
}

function column(envName: string, fallback: string) {
  return quoteIdentifierPath(process.env[envName] ?? fallback);
}

interface TicketQuery {
  text: string;
  values: unknown[];
}

function buildCanonicalQuery(maxRows: number): TicketQuery {
  const table = quoteIdentifierPath(process.env.TICKETS_TABLE ?? "public.analytics_tickets");
  return {
    text: `
      SELECT
        ${column("TICKET_ID_COLUMN", "ticket_id")} AS "id",
        ${column("TICKET_TITLE_COLUMN", "title")} AS "title",
        ${column("TICKET_CREATED_AT_COLUMN", "created_at")} AS "createdAt",
        ${column("TICKET_FIRST_RESPONSE_AT_COLUMN", "first_response_at")} AS "firstResponseAt",
        ${column("TICKET_RESOLVED_AT_COLUMN", "resolved_at")} AS "resolvedAt",
        ${column("TICKET_STATUS_COLUMN", "status")} AS "status",
        ${column("TICKET_PRIORITY_COLUMN", "priority")} AS "priority",
        ${column("TICKET_CATEGORY_COLUMN", "category")} AS "category",
        ${column("TICKET_CUSTOMER_COLUMN", "customer")} AS "customer",
        ${column("TICKET_TEAM_COLUMN", "team")} AS "team",
        ${column("TICKET_ASSIGNEE_COLUMN", "assignee")} AS "assignee",
        ${column("TICKET_SLA_BREACHED_COLUMN", "sla_breached")} AS "slaBreached",
        ${column("TICKET_UPDATED_AT_COLUMN", "updated_at")} AS "updatedAt"
      FROM ${table}
      ORDER BY ${column("TICKET_CREATED_AT_COLUMN", "created_at")} DESC
      LIMIT $1
    `,
    values: [maxRows],
  };
}

export function buildFinnegansRelationshipQuery(maxRows: number): TicketQuery {
  const table = quoteIdentifierPath(
    process.env.TICKETS_TABLE ?? "public.fisterra_fisterra_gestion_relacionamiento_v2",
  );
  const processName = process.env.TICKET_PROCESS?.trim();
  const processFilter = processName ? "WHERE proceso = $2" : "";
  return {
    text: `
      SELECT
        coalesce(nullif(trim(transaccionid), ''), casoactividadid) AS "id",
        coalesce(nullif(trim(titulo), ''), nullif(trim(caso), ''), 'Ticket sin título') AS "title",
        substring(fechapublicacion, 1, 19)::timestamp AS "createdAt",
        NULL::timestamp AS "firstResponseAt",
        CASE
          WHEN upper(trim(ultimaactividad)) IN ('FIN', 'DESCARTADA')
            THEN substring(fechaultimaactividad, 1, 19)::timestamp
          ELSE NULL
        END AS "resolvedAt",
        coalesce(nullif(trim(ultimaactividad), ''), 'Sin estado') AS "status",
        coalesce(nullif(trim(prioridad), ''), '5 - Sin Asignar') AS "priority",
        coalesce(nullif(trim(originacionnombre), ''), 'Sin tipo') AS "category",
        coalesce(nullif(trim(organizacion), ''), 'Sin organización') AS "customer",
        coalesce(nullif(trim(equipo), ''), 'Sin equipo') AS "team",
        coalesce(nullif(trim(nombre_responsable), ''), nullif(trim(responsable), ''), 'Sin asignar') AS "assignee",
        CASE
          WHEN upper(trim(ultimaactividad)) NOT IN ('FIN', 'DESCARTADA')
            AND fechafintarea ~ '^20\\d{2}-\\d{2}-\\d{2}'
            AND substring(fechafintarea, 1, 19)::timestamp < current_timestamp
          THEN true
          ELSE false
        END AS "slaBreached",
        substring(fechaaltaauditoria, 1, 23)::timestamp AS "updatedAt"
      FROM ${table}
      ${processFilter}
      ORDER BY substring(fechapublicacion, 1, 19)::timestamp DESC
      LIMIT $1
    `,
    values: processName ? [maxRows, processName] : [maxRows],
  };
}

function buildSelectQuery(maxRows: number) {
  return process.env.TICKET_ADAPTER === "finnegans_relationship"
    ? buildFinnegansRelationshipQuery(maxRows)
    : buildCanonicalQuery(maxRows);
}

function iso(value: unknown, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error("El dataset contiene una fecha obligatoria vacía.");
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Fecha inválida en el dataset: ${String(value)}`);
  return parsed.toISOString();
}

function text(value: unknown, fallback = "Sin asignar") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function bool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "t", "1", "si", "sí", "vencido"].includes(String(value ?? "").toLocaleLowerCase("es"));
}

async function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL para conectar con Finnegans Data Warehouse.");
  const { Pool } = await import("pg");
  const sslEnabled = process.env.DATABASE_SSL !== "false";
  pool = new Pool({
    connectionString,
    max: numberFromEnv("DATABASE_POOL_MAX", 5, 1, 10),
    connectionTimeoutMillis: numberFromEnv("DATABASE_CONNECTION_TIMEOUT_MS", 10_000, 1_000, 60_000),
    statement_timeout: numberFromEnv("DATABASE_STATEMENT_TIMEOUT_MS", 15_000, 1_000, 60_000),
    idleTimeoutMillis: numberFromEnv("DATABASE_IDLE_TIMEOUT_MS", 30_000, 1_000, 300_000),
    allowExitOnIdle: true,
    application_name: "finnegans-ticket-analytics",
    ssl: sslEnabled
      ? {
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
          ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}),
        }
      : false,
  });
  return pool;
}

async function loadPostgresTickets(): Promise<Ticket[]> {
  const client = await getPool();
  const maxRows = numberFromEnv("TICKET_MAX_ROWS", 100_000, 1_000, 100_000);
  const query = buildSelectQuery(maxRows);
  const result = await client.query<Record<string, unknown>>(query.text, query.values);
  return result.rows.map((row) => ({
    id: text(row.id, "Sin ID"),
    title: text(row.title, "Ticket sin título"),
    createdAt: iso(row.createdAt) as string,
    firstResponseAt: iso(row.firstResponseAt, false),
    resolvedAt: iso(row.resolvedAt, false),
    status: text(row.status),
    priority: text(row.priority),
    category: text(row.category),
    customer: text(row.customer),
    team: text(row.team),
    assignee: text(row.assignee),
    slaBreached: bool(row.slaBreached),
    updatedAt: iso(row.updatedAt) as string,
  }));
}

async function loadTickets() {
  return getDataSource() === "postgres" ? loadPostgresTickets() : getMockTickets();
}

export async function getTickets() {
  const now = Date.now();
  if (cache?.value && cache.expiresAt > now) return cache.value;
  if (cache?.pending) return cache.pending;

  const ttl = numberFromEnv("TICKET_CACHE_TTL_SECONDS", 3_600, 60, 86_400) * 1_000;
  const pending = loadTickets()
    .then((value) => {
      cache = { value, expiresAt: Date.now() + ttl };
      return value;
    })
    .catch((error) => {
      cache = undefined;
      throw error;
    });
  cache = { pending, expiresAt: now + ttl };
  return pending;
}

export function clearTicketCache() {
  cache = undefined;
}
