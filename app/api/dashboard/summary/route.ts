import { calculateSummary } from "@/lib/tickets/analytics";
import { parseDashboardFilters } from "@/lib/tickets/filters";
import { apiError, jsonResponse } from "@/lib/tickets/http";
import { getDataSource, getTerminalStatuses, getTickets } from "@/lib/tickets/repository";
import { getCachedSummary } from "@/lib/tickets/summary-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const filters = parseDashboardFilters(new URL(request.url).searchParams);
    const dataSource = getDataSource();
    const cacheKey = JSON.stringify({ dataSource, process: process.env.TICKET_PROCESS, filters });
    const summary = await getCachedSummary(cacheKey, async () => {
      const tickets = await getTickets();
      return calculateSummary(tickets, filters, {
        terminalStatuses: getTerminalStatuses(),
        dataSource,
      });
    });
    return jsonResponse(summary);
  } catch (error) {
    return apiError(error);
  }
}
