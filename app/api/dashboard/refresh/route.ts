import { apiError, jsonResponse } from "@/lib/tickets/http";
import { clearTicketCache, getDataSource, getTickets } from "@/lib/tickets/repository";
import { clearSummaryCache } from "@/lib/tickets/summary-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function getSourceUpdatedAt(tickets: Awaited<ReturnType<typeof getTickets>>) {
  return tickets.reduce<string | undefined>((latest, ticket) => {
    if (!ticket.updatedAt) return latest;
    if (!latest || new Date(ticket.updatedAt).getTime() > new Date(latest).getTime()) return ticket.updatedAt;
    return latest;
  }, undefined);
}

export async function POST() {
  try {
    clearTicketCache();
    clearSummaryCache();

    const tickets = await getTickets();
    return jsonResponse(
      {
        dataSource: getDataSource(),
        refreshedAt: new Date().toISOString(),
        sourceUpdatedAt: getSourceUpdatedAt(tickets),
        tickets: tickets.length,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
