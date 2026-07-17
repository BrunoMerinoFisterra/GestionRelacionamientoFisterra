import type {
  CompanyPoint,
  DashboardFilters,
  DashboardSummary,
  DistributionPoint,
  Ticket,
  TrendPoint,
} from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
export const DEFAULT_TERMINAL_STATUSES = ["resuelto", "cerrado", "cancelado"];

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function asDate(value: string | null) {
  return value ? new Date(value) : null;
}

function inRange(value: string | null, from: Date, to: Date) {
  const date = asDate(value);
  return Boolean(date && date >= from && date <= to);
}

export function getAgeDays(ticket: Ticket, asOf: Date) {
  const end = ticket.resolvedAt ? new Date(ticket.resolvedAt) : asOf;
  return Math.max(0, Math.floor((end.getTime() - new Date(ticket.createdAt).getTime()) / DAY_MS));
}

export function getAgingBucket(ageDays: number) {
  if (ageDays <= 7) return "0–7 días";
  if (ageDays <= 15) return "8–15 días";
  if (ageDays <= 30) return "16–30 días";
  if (ageDays <= 60) return "31–60 días";
  return "61+ días";
}

export function isOpenAt(ticket: Ticket, at: Date, terminalStatuses = DEFAULT_TERMINAL_STATUSES) {
  const created = new Date(ticket.createdAt);
  if (created > at) return false;
  const resolved = asDate(ticket.resolvedAt);
  if (resolved) return resolved > at;
  return !terminalStatuses.includes(ticket.status.toLocaleLowerCase("es"));
}

function matchesDimensions(ticket: Ticket, filters: DashboardFilters) {
  const mappings: Array<[keyof DashboardFilters, keyof Ticket]> = [
    ["status", "status"],
    ["priority", "priority"],
    ["category", "category"],
    ["customer", "customer"],
    ["team", "team"],
    ["assignee", "assignee"],
  ];
  return mappings.every(([filterKey, ticketKey]) => {
    const expected = filters[filterKey];
    return !expected || String(ticket[ticketKey]) === expected;
  });
}

function distribution(values: string[], limit = 8): DistributionPoint[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value || "Sin asignar", (counts.get(value || "Sin asignar") ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sourceUpdatedAt(tickets: Ticket[]) {
  return tickets.reduce((latest, ticket) => ticket.updatedAt > latest ? ticket.updatedAt : latest, tickets[0]?.updatedAt ?? new Date(0).toISOString());
}

function companyBreakdown(openTickets: Ticket[]): CompanyPoint[] {
  const companies = new Map<string, CompanyPoint>();
  for (const ticket of openTickets) {
    const current = companies.get(ticket.customer) ?? { name: ticket.customer, pending: 0, overdue: 0 };
    current.pending += 1;
    if (ticket.slaBreached) current.overdue += 1;
    companies.set(ticket.customer, current);
  }
  return [...companies.values()].sort((a, b) => b.pending - a.pending).slice(0, 8);
}

export function filterTicketsForPeriod(
  tickets: Ticket[],
  filters: DashboardFilters,
  terminalStatuses = DEFAULT_TERMINAL_STATUSES,
) {
  const from = startOfDay(filters.from);
  const to = endOfDay(filters.to);
  return tickets.filter((ticket) => {
    if (!matchesDimensions(ticket, filters)) return false;
    return inRange(ticket.createdAt, from, to) || inRange(ticket.resolvedAt, from, to) || isOpenAt(ticket, to, terminalStatuses);
  });
}

export function calculateSummary(
  tickets: Ticket[],
  filters: DashboardFilters,
  options?: { now?: Date; terminalStatuses?: string[]; dataSource?: "mock" | "postgres" },
): DashboardSummary {
  const from = startOfDay(filters.from);
  const to = endOfDay(filters.to);
  const now = options?.now ?? new Date();
  const asOf = to < now ? to : now;
  const terminalStatuses = options?.terminalStatuses ?? DEFAULT_TERMINAL_STATUSES;
  const scoped = tickets.filter((ticket) => matchesDimensions(ticket, filters));
  const pending = scoped.filter((ticket) => isOpenAt(ticket, asOf, terminalStatuses));
  const overdue = pending.filter((ticket) => ticket.slaBreached);
  const created = scoped.filter((ticket) => inRange(ticket.createdAt, from, to));
  const resolved = scoped.filter((ticket) => inRange(ticket.resolvedAt, from, to));

  const firstResponseHours = created.flatMap((ticket) => ticket.firstResponseAt
    ? [(new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime()) / HOUR_MS]
    : []);
  const resolutionHours = resolved.flatMap((ticket) => ticket.resolvedAt
    ? [(new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime()) / HOUR_MS]
    : []);

  const agingOrder = ["0–7 días", "8–15 días", "16–30 días", "31–60 días", "61+ días"];
  const agingCounts = new Map(agingOrder.map((name) => [name, 0]));
  for (const ticket of pending) {
    const bucket = getAgingBucket(getAgeDays(ticket, asOf));
    agingCounts.set(bucket, (agingCounts.get(bucket) ?? 0) + 1);
  }

  const trend: TrendPoint[] = [];
  for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor.getTime() + DAY_MS - 1);
    trend.push({
      date: dayStart.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(dayStart),
      created: scoped.filter((ticket) => inRange(ticket.createdAt, dayStart, dayEnd)).length,
      resolved: scoped.filter((ticket) => inRange(ticket.resolvedAt, dayStart, dayEnd)).length,
      backlog: scoped.filter((ticket) => isOpenAt(ticket, dayEnd, terminalStatuses)).length,
    });
  }

  const ages = pending.map((ticket) => getAgeDays(ticket, asOf));
  return {
    metrics: {
      pending: pending.length,
      overdue: overdue.length,
      created: created.length,
      resolved: resolved.length,
      slaCompliance: pending.length ? ((pending.length - overdue.length) / pending.length) * 100 : 100,
      averageAgeDays: average(ages),
      averageFirstResponseHours: average(firstResponseHours),
      averageResolutionHours: average(resolutionHours),
    },
    trend,
    priorities: distribution(pending.map((ticket) => ticket.priority), 6),
    categories: distribution(pending.map((ticket) => ticket.category), 7),
    statuses: distribution(pending.map((ticket) => ticket.status), 7),
    aging: agingOrder.map((name) => ({ name, value: agingCounts.get(name) ?? 0 })),
    companies: companyBreakdown(pending),
    oldestOpen: [...pending]
      .sort((a, b) => getAgeDays(b, asOf) - getAgeDays(a, asOf))
      .slice(0, 6)
      .map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        customer: ticket.customer,
        priority: ticket.priority,
        ageDays: getAgeDays(ticket, asOf),
        slaBreached: ticket.slaBreached,
      })),
    sourceUpdatedAt: sourceUpdatedAt(tickets),
    generatedAt: now.toISOString(),
    dataSource: options?.dataSource ?? "mock",
  };
}
