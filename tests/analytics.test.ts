import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSummary,
  filterTicketsForPeriod,
  getAgingBucket,
  isOpenAt,
} from "../lib/tickets/analytics";
import type { DashboardFilters, Ticket } from "../lib/tickets/types";

const base: Omit<Ticket, "id" | "createdAt" | "resolvedAt" | "slaBreached"> = {
  title: "Ticket de prueba",
  firstResponseAt: "2026-06-01T12:00:00.000Z",
  status: "Abierto",
  priority: "2 · Alta",
  category: "Soporte",
  customer: "Empresa A",
  team: "Relacionamiento",
  assignee: "Ana López",
  updatedAt: "2026-06-30T10:00:00.000Z",
};

const tickets: Ticket[] = [
  { ...base, id: "A", createdAt: "2026-06-01T08:00:00.000Z", resolvedAt: null, slaBreached: true },
  { ...base, id: "B", status: "Resuelto", createdAt: "2026-05-20T08:00:00.000Z", resolvedAt: "2026-06-10T10:00:00.000Z", slaBreached: false },
  { ...base, id: "C", priority: "3 · Media", createdAt: "2026-07-02T08:00:00.000Z", resolvedAt: null, slaBreached: false },
];

const filters: DashboardFilters = { from: "2026-06-01", to: "2026-06-30" };

test("calcula backlog, altas, resoluciones y SLA con límites inclusivos", () => {
  const summary = calculateSummary(tickets, filters, { now: new Date("2026-06-30T18:00:00.000Z") });
  assert.equal(summary.metrics.pending, 1);
  assert.equal(summary.metrics.overdue, 1);
  assert.equal(summary.metrics.created, 1);
  assert.equal(summary.metrics.resolved, 1);
  assert.equal(summary.metrics.slaCompliance, 0);
  assert.equal(summary.oldestOpen[0].id, "A");
});

test("incluye backlog anterior y tickets resueltos dentro del período", () => {
  const result = filterTicketsForPeriod(tickets, filters);
  assert.deepEqual(result.map((ticket) => ticket.id), ["A", "B"]);
});

test("aplica filtros dimensionales sin alterar el conjunto fuente", () => {
  const summary = calculateSummary(tickets, { ...filters, priority: "3 · Media" }, { now: new Date("2026-06-30T18:00:00.000Z") });
  assert.equal(summary.metrics.pending, 0);
  assert.equal(summary.metrics.created, 0);
  assert.equal(tickets.length, 3);
});

test("clasifica la antigüedad en los intervalos acordados", () => {
  assert.equal(getAgingBucket(7), "0–7 días");
  assert.equal(getAgingBucket(8), "8–15 días");
  assert.equal(getAgingBucket(31), "31–60 días");
  assert.equal(getAgingBucket(80), "61+ días");
});

test("respeta la fecha de resolución al reconstruir backlog histórico", () => {
  assert.equal(isOpenAt(tickets[1], new Date("2026-06-01T23:00:00.000Z")), true);
  assert.equal(isOpenAt(tickets[1], new Date("2026-06-11T00:00:00.000Z")), false);
});
