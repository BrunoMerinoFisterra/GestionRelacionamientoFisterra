export function jsonResponse(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, max-age=60, stale-while-revalidate=300");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  console.error("Ticket analytics API error", error);
  return jsonResponse(
    {
      error: "No pudimos consultar el Data Warehouse.",
      detail: process.env.NODE_ENV === "development" ? message : undefined,
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
