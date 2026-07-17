import { jsonResponse } from "@/lib/tickets/http";

export async function GET() {
  return jsonResponse({ status: "ok", service: "ticket-analytics" }, {
    headers: { "cache-control": "no-store" },
  });
}
