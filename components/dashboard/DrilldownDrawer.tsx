"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Layers3,
  LoaderCircle,
  Tag,
  X,
} from "lucide-react";
import type { Ticket, TicketListResponse } from "@/lib/tickets/types";

export interface DrilldownSelection {
  title: string;
  description: string;
  params: Record<string, string>;
  initialTicketId?: string;
}

const number = new Intl.NumberFormat("es-AR");
const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formattedDate(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "No disponible";
}

function TicketDetails({ ticket }: { ticket: Ticket & { ageDays: number } }) {
  return (
    <div className="drill-ticket-details">
      <div><CalendarDays size={15} /><span>Creado</span><strong>{formattedDate(ticket.createdAt)}</strong></div>
      <div><Clock3 size={15} /><span>Primera respuesta</span><strong>{formattedDate(ticket.firstResponseAt)}</strong></div>
      <div><CalendarDays size={15} /><span>Resolución</span><strong>{formattedDate(ticket.resolvedAt)}</strong></div>
      <div><Building2 size={15} /><span>Empresa</span><strong>{ticket.customer}</strong></div>
      <div><Layers3 size={15} /><span>Equipo</span><strong>{ticket.team}</strong></div>
      <div><CircleUserRound size={15} /><span>Responsable</span><strong>{ticket.assignee}</strong></div>
      <div><Tag size={15} /><span>Tipo</span><strong>{ticket.category}</strong></div>
      <div><Clock3 size={15} /><span>Antigüedad</span><strong>{ticket.ageDays} días</strong></div>
      <div className="drill-ticket-updated"><span>Último cambio registrado</span><strong>{formattedDate(ticket.updatedAt)}</strong></div>
    </div>
  );
}

export function DrilldownDrawer({
  selection,
  baseQuery,
  onClose,
}: {
  selection: DrilldownSelection | null;
  baseQuery: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TicketListResponse>();
  const [expandedId, setExpandedId] = useState<string | undefined>(selection?.initialTicketId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    const params = new URLSearchParams(baseQuery);
    Object.entries(selection.params).forEach(([key, value]) => params.set(key, value));
    params.set("page", String(page));
    params.set("pageSize", "10");
    params.set("sort", "age");
    params.set("direction", "desc");
    fetch(`/api/tickets?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.detail || data?.error || "No pudimos cargar el detalle.");
        return data as TicketListResponse;
      })
      .then(setResult)
      .catch((caught) => {
        if (caught instanceof Error && caught.name !== "AbortError") setError(caught.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selection, baseQuery, page]);

  const changePage = (nextPage: number) => {
    setLoading(true);
    setError("");
    setExpandedId(undefined);
    setPage(nextPage);
  };

  useEffect(() => {
    if (!selection) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selection, onClose]);

  if (!selection) return null;

  return (
    <div className="drill-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drill-drawer" role="dialog" aria-modal="true" aria-labelledby="drill-title">
        <header className="drill-header">
          <div>
            <span>Exploración de tickets</span>
            <h2 id="drill-title">{selection.title}</h2>
            <p>{selection.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle"><X size={20} /></button>
        </header>

        <div className="drill-summary">
          <strong>{result ? number.format(result.total) : "—"}</strong>
          <span>{result?.total === 1 ? "ticket encontrado" : "tickets encontrados"}</span>
          <small>Seleccioná un ticket para ver toda su información</small>
        </div>

        <div className="drill-content">
          {loading && !result && <div className="drill-loading"><LoaderCircle size={22} /><span>Cargando tickets…</span></div>}
          {error && <div className="drill-error"><AlertTriangle size={18} /><span>{error}</span></div>}
          {result?.items.map((ticket) => {
            const expanded = expandedId === ticket.id;
            return (
              <article className={`drill-ticket ${expanded ? "expanded" : ""}`} key={ticket.id}>
                <button type="button" className="drill-ticket-toggle" onClick={() => setExpandedId(expanded ? undefined : ticket.id)} aria-expanded={expanded}>
                  <div>
                    <span>{ticket.id}</span>
                    <strong>{ticket.title}</strong>
                    <small>{ticket.customer} · {ticket.priority}</small>
                  </div>
                  <div className="drill-ticket-state">
                    <em className={ticket.slaBreached ? "overdue" : ""}>{ticket.slaBreached ? "Vencido" : ticket.status}</em>
                    <ChevronDown size={17} />
                  </div>
                </button>
                {expanded && <TicketDetails ticket={ticket} />}
              </article>
            );
          })}
          {result && !result.items.length && <div className="drill-empty">No hay tickets para este segmento y período.</div>}
        </div>

        {result && result.total > 0 && (
          <footer className="drill-pagination">
            <span>Página {result.page} de {result.pageCount}</span>
            <div>
              <button type="button" aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}><ChevronLeft size={17} /></button>
              <button type="button" aria-label="Página siguiente" disabled={page >= result.pageCount || loading} onClick={() => changePage(page + 1)}><ChevronRight size={17} /></button>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
