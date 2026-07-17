import type { DashboardFilters } from "./types";

const DAY_MS = 86_400_000;

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

export function getDefaultRange(now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - 29 * DAY_MS);
  return { from: toDateInput(from), to: toDateInput(to) };
}

export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const defaults = getDefaultRange();
  const from = validDate(searchParams.get("from")) ?? defaults.from;
  const to = validDate(searchParams.get("to")) ?? defaults.to;
  const safeFrom = from <= to ? from : to;
  const safeTo = from <= to ? to : from;

  const optional = (key: string) => {
    const value = searchParams.get(key)?.trim();
    return value ? value.slice(0, 120) : undefined;
  };

  return {
    from: safeFrom,
    to: safeTo,
    status: optional("status"),
    priority: optional("priority"),
    category: optional("category"),
    customer: optional("customer"),
    team: optional("team"),
    assignee: optional("assignee"),
  };
}

export function filtersToSearchParams(filters: DashboardFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  for (const key of ["status", "priority", "category", "customer", "team", "assignee"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return params;
}
