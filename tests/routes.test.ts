import assert from "node:assert/strict";
import test from "node:test";
import { GET as getSummary } from "../app/api/dashboard/summary/route";
import { POST as refreshDashboard } from "../app/api/dashboard/refresh/route";
import { GET as getFilters } from "../app/api/filters/route";
import { GET as getTicketList } from "../app/api/tickets/route";
import {
  buildFinnegansRelationshipQuery,
  clearTicketCache,
  quoteIdentifierPath,
} from "../lib/tickets/repository";
import { clearSummaryCache } from "../lib/tickets/summary-cache";

process.env.DATA_SOURCE = "mock";

test("summary devuelve el contrato analítico", async () => {
  clearTicketCache();
  clearSummaryCache();
  const response = await getSummary(new Request("http://localhost/api/dashboard/summary"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.dataSource, "mock");
  assert.equal(typeof body.metrics.pending, "number");
  assert.ok(Array.isArray(body.trend));
  assert.ok(body.sourceUpdatedAt);
});

test("la actualización manual limpia las cachés y vuelve a consultar la fuente", async () => {
  clearTicketCache();
  clearSummaryCache();
  const response = await refreshDashboard();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.dataSource, "mock");
  assert.ok(body.tickets > 0);
  assert.ok(body.refreshedAt);
});

test("tickets pagina y limita el tamaño solicitado", async () => {
  const response = await getTicketList(new Request("http://localhost/api/tickets?page=1&pageSize=5&sort=age&direction=desc"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 5);
  assert.ok(body.items.length <= 5);
  assert.ok(body.total >= body.items.length);
});

test("tickets permite explorar vencidos y abrir un ticket específico", async () => {
  const overdueResponse = await getTicketList(new Request("http://localhost/api/tickets?scope=overdue&pageSize=50"));
  assert.equal(overdueResponse.status, 200);
  const overdue = await overdueResponse.json();
  assert.ok(overdue.items.length > 0);
  assert.ok(overdue.items.every((ticket: { slaBreached: boolean }) => ticket.slaBreached));

  const selected = overdue.items[0];
  const ticketResponse = await getTicketList(new Request(`http://localhost/api/tickets?ticketId=${encodeURIComponent(selected.id)}`));
  assert.equal(ticketResponse.status, 200);
  const ticket = await ticketResponse.json();
  assert.equal(ticket.total, 1);
  assert.equal(ticket.items[0].id, selected.id);
});

test("filters devuelve opciones únicas", async () => {
  const response = await getFilters();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.customers.length > 1);
  assert.equal(new Set(body.customers).size, body.customers.length);
});

test("rechaza identificadores SQL no seguros", () => {
  assert.equal(quoteIdentifierPath("public.analytics_tickets"), '"public"."analytics_tickets"');
  assert.throws(() => quoteIdentifierPath("tickets; DROP TABLE users"));
});

test("el adaptador Finnegans incluye todos los procesos por defecto", () => {
  const previous = process.env.TICKET_PROCESS;
  try {
    process.env.TICKET_PROCESS = "";
    const allTickets = buildFinnegansRelationshipQuery(100_000);
    assert.doesNotMatch(allTickets.text, /WHERE proceso/);
    assert.deepEqual(allTickets.values, [100_000]);

    process.env.TICKET_PROCESS = "Ticket 2026";
    const annualTickets = buildFinnegansRelationshipQuery(100_000);
    assert.match(annualTickets.text, /WHERE proceso = \$2/);
    assert.deepEqual(annualTickets.values, [100_000, "Ticket 2026"]);
  } finally {
    if (previous === undefined) delete process.env.TICKET_PROCESS;
    else process.env.TICKET_PROCESS = previous;
  }
});
