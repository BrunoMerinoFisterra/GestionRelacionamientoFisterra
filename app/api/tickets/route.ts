import { filterTicketsForPeriod, getAgeDays, getAgingBucket, isOpenAt } from "@/lib/tickets/analytics";
import { parseDashboardFilters } from "@/lib/tickets/filters";
import { apiError, jsonResponse } from "@/lib/tickets/http";
import { clearTicketCache, getDataSource, getTerminalStatuses, getTickets } from "@/lib/tickets/repository";
import type { Ticket, TicketDrilldownScope } from "@/lib/tickets/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const sortFields = new Set(["age", "createdAt", "customer", "priority", "status", "assignee"]);
const drilldownScopes = new Set<TicketDrilldownScope>(["all", "pending", "overdue", "inTime", "created", "resolved"]);

function inPeriod(value: string | null, from: Date, to: Date) {
  if (!value) return false;
  const date = new Date(value);
  return date >= from && date <= to;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function compareTickets(a: Ticket, b: Ticket, sort: string, asOf: Date) {
  if (sort === "age") return getAgeDays(a, asOf) - getAgeDays(b, asOf);
  if (sort === "createdAt") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const key = sort as "customer" | "priority" | "status" | "assignee";
  return a[key].localeCompare(b[key], "es", { numeric: true });
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.has("refresh")) clearTicketCache();
    const filters = parseDashboardFilters(searchParams);
    const page = boundedInteger(searchParams.get("page"), 1, 1, 10_000);
    const pageSize = boundedInteger(searchParams.get("pageSize"), 10, 5, 50);
    const requestedSort = searchParams.get("sort") ?? "age";
    const sort = sortFields.has(requestedSort) ? requestedSort : "age";
    const direction = searchParams.get("direction") === "asc" ? 1 : -1;
    const requestedScope = searchParams.get("scope") as TicketDrilldownScope | null;
    const scope = requestedScope && drilldownScopes.has(requestedScope) ? requestedScope : "all";
    const ticketId = searchParams.get("ticketId")?.trim().slice(0, 160);
    const ageBucket = searchParams.get("ageBucket")?.trim().slice(0, 40);
    const from = new Date(`${filters.from}T00:00:00.000Z`);
    const asOf = new Date(`${filters.to}T23:59:59.999Z`);
    const allTickets = await getTickets();
    const terminalStatuses = getTerminalStatuses();
    let filtered = filterTicketsForPeriod(allTickets, filters, terminalStatuses);

    if (ticketId) filtered = filtered.filter((ticket) => ticket.id === ticketId);
    if (scope === "pending") filtered = filtered.filter((ticket) => isOpenAt(ticket, asOf, terminalStatuses));
    if (scope === "overdue") filtered = filtered.filter((ticket) => isOpenAt(ticket, asOf, terminalStatuses) && ticket.slaBreached);
    if (scope === "inTime") filtered = filtered.filter((ticket) => isOpenAt(ticket, asOf, terminalStatuses) && !ticket.slaBreached);
    if (scope === "created") filtered = filtered.filter((ticket) => inPeriod(ticket.createdAt, from, asOf));
    if (scope === "resolved") filtered = filtered.filter((ticket) => inPeriod(ticket.resolvedAt, from, asOf));
    if (ageBucket) {
      filtered = filtered.filter((ticket) => isOpenAt(ticket, asOf, terminalStatuses) && getAgingBucket(getAgeDays(ticket, asOf)) === ageBucket);
    }

    filtered.sort((a, b) => direction * compareTickets(a, b, sort, asOf));
    const offset = (page - 1) * pageSize;
    const sourceUpdatedAt = allTickets.reduce(
      (latest, ticket) => ticket.updatedAt > latest ? ticket.updatedAt : latest,
      allTickets[0]?.updatedAt ?? new Date(0).toISOString(),
    );

    return jsonResponse({
      items: filtered.slice(offset, offset + pageSize).map((ticket) => ({
        ...ticket,
        ageDays: getAgeDays(ticket, asOf),
      })),
      page,
      pageSize,
      total: filtered.length,
      pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
      sourceUpdatedAt,
      dataSource: getDataSource(),
    });
  } catch (error) {
    return apiError(error);
  }
}
