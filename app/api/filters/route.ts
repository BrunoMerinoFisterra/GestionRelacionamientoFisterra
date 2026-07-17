import { apiError, jsonResponse } from "@/lib/tickets/http";
import { getDataSource, getTickets } from "@/lib/tickets/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

export async function GET() {
  try {
    const tickets = await getTickets();
    const sourceUpdatedAt = tickets.reduce(
      (latest, ticket) => ticket.updatedAt > latest ? ticket.updatedAt : latest,
      tickets[0]?.updatedAt ?? new Date(0).toISOString(),
    );
    return jsonResponse({
      statuses: unique(tickets.map((ticket) => ticket.status)),
      priorities: unique(tickets.map((ticket) => ticket.priority)),
      categories: unique(tickets.map((ticket) => ticket.category)),
      customers: unique(tickets.map((ticket) => ticket.customer)),
      teams: unique(tickets.map((ticket) => ticket.team)),
      assignees: unique(tickets.map((ticket) => ticket.assignee)),
      sourceUpdatedAt,
      dataSource: getDataSource(),
    });
  } catch (error) {
    return apiError(error);
  }
}
