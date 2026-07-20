"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  Filter,
  LayoutDashboard,
  ListFilter,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Search,
  TicketCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { filtersToSearchParams, getDefaultRange } from "@/lib/tickets/filters";
import type {
  DashboardFilters,
  DashboardSummary,
  FilterOptions,
  TicketListResponse,
} from "@/lib/tickets/types";
import { DrilldownDrawer, type DrilldownSelection } from "./DrilldownDrawer";

type View = "resumen" | "analisis";
type SortKey = "age" | "createdAt" | "customer" | "priority" | "status" | "assignee";

const COLORS = ["#2478ff", "#12a8a0", "#5a67d8", "#f2a541", "#ef665f", "#8290a5"];
const LAST_MANUAL_REFRESH_KEY = "nexo:last-manual-refresh";
const number = new Intl.NumberFormat("es-AR");
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.detail || data?.error || "No pudimos cargar los datos.");
  return data;
}

function formatHours(value: number) {
  if (value >= 48) return `${decimal.format(value / 24)} d`;
  return `${decimal.format(value)} h`;
}

function truncate(value: string, length = 20) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  onExplore,
  tone = "blue",
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  onExplore: () => void;
  tone?: "blue" | "red" | "teal" | "amber" | "navy";
}) {
  return (
    <button type="button" className={`kpi-card kpi-${tone} kpi-interactive`} onClick={onExplore} aria-label={`${label}: ${value}. Ver tickets`}>
      <div className="kpi-icon" aria-hidden="true"><Icon size={20} /></div>
      <div className="kpi-content">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
      <MousePointerClick className="kpi-explore-icon" size={15} aria-hidden="true" />
    </button>
  );
}

function Panel({
  title,
  eyebrow,
  children,
  className = "",
  action,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div>
        {action}
      </header>
      {children}
    </section>
  );
}

function DrilldownAction({ label = "Ver tickets", onClick }: { label?: string; onClick: () => void }) {
  return <button type="button" className="panel-drilldown" onClick={onClick}><ListFilter size={14} />{label}</button>;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function FiltersBar({
  filters,
  options,
  activeFilters,
  onChange,
  onReset,
  className = "",
}: {
  filters: DashboardFilters;
  options?: FilterOptions;
  activeFilters: number;
  onChange: (key: keyof DashboardFilters, value: string) => void;
  onReset: () => void;
  className?: string;
}) {
  return (
    <section className={`filters-card ${className}`} aria-label="Filtros del tablero">
      <div className="filter-heading"><Filter size={17} /><span>Filtros</span>{activeFilters > 0 && <b>{activeFilters}</b>}</div>
      <FilterSelect label="Responsable" value={filters.assignee} options={options?.assignees ?? []} onChange={(value) => onChange("assignee", value)} />
      <FilterSelect label="Organización" value={filters.customer} options={options?.customers ?? []} onChange={(value) => onChange("customer", value)} />
      <FilterSelect label="Tipo de tarea" value={filters.category} options={options?.categories ?? []} onChange={(value) => onChange("category", value)} />
      <FilterSelect label="Equipo de trabajo" value={filters.team} options={options?.teams ?? []} onChange={(value) => onChange("team", value)} />
      <FilterSelect label="Última actividad" value={filters.status} options={options?.statuses ?? []} onChange={(value) => onChange("status", value)} />
      <FilterSelect label="Prioridad" value={filters.priority} options={options?.priorities ?? []} onChange={(value) => onChange("priority", value)} />
      <label className="filter-field date-field"><span>Desde</span><input type="date" value={filters.from} max={filters.to} onChange={(event) => onChange("from", event.target.value)} /></label>
      <label className="filter-field date-field"><span>Hasta</span><input type="date" value={filters.to} min={filters.from} onChange={(event) => onChange("to", event.target.value)} /></label>
      <button type="button" className="reset-button" onClick={onReset} title="Restablecer filtros"><RotateCcw size={17} /><span>Limpiar</span></button>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="dashboard-loading" role="status" aria-live="polite">
      <div className="loading-title" />
      <div className="loading-grid">{Array.from({ length: 5 }, (_, index) => <div key={index} />)}</div>
      <div className="loading-chart" />
      <span>Cargando indicadores…</span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <div><AlertTriangle size={24} /></div>
      <h2>No pudimos consultar los tickets</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}><RefreshCw size={16} /> Reintentar</button>
    </div>
  );
}

export function SummaryCharts({
  summary,
  onExplore,
}: {
  summary: DashboardSummary;
  onExplore: (selection: DrilldownSelection) => void;
}) {
  const slaData = [
    { name: "En término", value: Math.max(0, summary.metrics.pending - summary.metrics.overdue) },
    { name: "Vencido", value: summary.metrics.overdue },
  ];

  return (
    <>
      <div className="overview-grid">
        <Panel
          title="Evolución del backlog"
          eyebrow="Últimos 30 días"
          className="trend-panel"
          action={<DrilldownAction label="Ver backlog" onClick={() => onExplore({ title: "Backlog del período", description: "Tickets que permanecían abiertos al cierre del período seleccionado.", params: { scope: "pending" } })} />}
        >
          <div className="chart-legend" aria-hidden="true">
            <span className="legend-blue">Backlog</span>
            <span className="legend-teal">Creados</span>
            <span className="legend-red">Resueltos</span>
          </div>
          <div className="chart chart-large" aria-label="Gráfico de evolución del backlog">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.trend} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="backlogArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2478ff" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#2478ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e6ebf2" />
                <XAxis dataKey="label" tick={{ fill: "#7a8799", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tick={{ fill: "#7a8799", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e3e8ef", boxShadow: "0 10px 28px rgba(20,37,63,.12)" }} />
                <Area type="monotone" dataKey="backlog" name="Backlog" stroke="#2478ff" strokeWidth={2.5} fill="url(#backlogArea)" />
                <Line type="monotone" dataKey="created" name="Creados" stroke="#12a8a0" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" name="Resueltos" stroke="#ef665f" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Situación de SLA"
          eyebrow="Tickets pendientes"
          className="sla-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Situación de SLA", description: "Todos los tickets pendientes, dentro y fuera de término.", params: { scope: "pending" } })} />}
        >
          <div className="sla-layout">
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slaData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={78} paddingAngle={2} stroke="none">
                    <Cell fill="#2478ff" />
                    <Cell fill="#ef665f" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><strong>{decimal.format(summary.metrics.slaCompliance)}%</strong><span>en término</span></div>
            </div>
            <div className="sla-summary">
              <button type="button" onClick={() => onExplore({ title: "Tickets dentro de término", description: "Backlog pendiente que todavía cumple el plazo registrado.", params: { scope: "inTime" } })}><i className="dot dot-blue" /><span>En término</span><strong>{number.format(slaData[0].value)}</strong></button>
              <button type="button" onClick={() => onExplore({ title: "Tickets vencidos", description: "Backlog pendiente cuya fecha límite ya pasó.", params: { scope: "overdue" } })}><i className="dot dot-red" /><span>Vencidos</span><strong>{number.format(slaData[1].value)}</strong></button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="secondary-grid">
        <Panel
          title="Pendientes por empresa"
          eyebrow="Top 8"
          className="company-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Pendientes por empresa", description: "Backlog abierto para las empresas incluidas en los filtros actuales.", params: { scope: "pending" } })} />}
        >
          <div className="chart chart-medium" aria-label="Tickets pendientes y vencidos por empresa">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.companies} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="#e6ebf2" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#7a8799", fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={118} tickFormatter={(value) => truncate(value, 18)} axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="pending" name="Pendientes" fill="#2478ff" radius={[0, 5, 5, 0]} barSize={11} />
                <Bar dataKey="overdue" name="Vencidos" fill="#ef665f" radius={[0, 5, 5, 0]} barSize={11} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Composición del backlog"
          eyebrow="Tipo y prioridad"
          className="composition-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Composición del backlog", description: "Todos los tickets pendientes del segmento actual.", params: { scope: "pending" } })} />}
        >
          <div className="composition-columns">
            <div>
              <h3>Tipos de tarea</h3>
              {summary.categories.slice(0, 5).map((item, index) => (
                <button type="button" className="distribution-row" key={item.name} onClick={() => onExplore({ title: item.name, description: "Tickets pendientes de este tipo de tarea.", params: { scope: "pending", category: item.name } })}>
                  <span><i style={{ backgroundColor: COLORS[index % COLORS.length] }} />{truncate(item.name, 22)}</span>
                  <strong>{number.format(item.value)}</strong>
                </button>
              ))}
            </div>
            <div>
              <h3>Prioridades</h3>
              {summary.priorities.map((item, index) => (
                <button type="button" className="distribution-row" key={item.name} onClick={() => onExplore({ title: item.name, description: "Tickets pendientes con esta prioridad.", params: { scope: "pending", priority: item.name } })}>
                  <span><i style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }} />{truncate(item.name, 22)}</span>
                  <strong>{number.format(item.value)}</strong>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Mayor antigüedad"
          eyebrow="Atención prioritaria"
          className="oldest-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Tickets con mayor antigüedad", description: "Backlog ordenado desde los casos más antiguos.", params: { scope: "pending" } })} />}
        >
          <div className="oldest-list">
            {summary.oldestOpen.map((ticket) => (
              <article key={ticket.id}>
                <button type="button" className="oldest-ticket-button" onClick={() => onExplore({ title: `Ticket ${ticket.id}`, description: "Detalle completo del ticket seleccionado.", params: { ticketId: ticket.id }, initialTicketId: ticket.id })}>
                  <div className={ticket.slaBreached ? "age-badge age-danger" : "age-badge"}>{ticket.ageDays}d</div>
                  <div><strong>{ticket.title}</strong><span>{ticket.customer} · {ticket.priority}</span></div>
                </button>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function SummaryBoard({ summary, onExplore }: { summary: DashboardSummary; onExplore: (selection: DrilldownSelection) => void }) {
  const inTime = Math.max(0, summary.metrics.pending - summary.metrics.overdue);
  const inTimePercent = summary.metrics.pending ? inTime / summary.metrics.pending * 100 : 100;
  const overduePercent = 100 - inTimePercent;
  const categoryTotal = summary.categories.reduce((sum, item) => sum + item.value, 0);
  const priorityTotal = summary.priorities.reduce((sum, item) => sum + item.value, 0);

  return (
    <>
      <section className="summary-kpi-strip" aria-label="Situación de tickets pendientes">
        <KpiCard label="Tickets pendientes a la fecha" value={number.format(summary.metrics.pending)} helper="Backlog al cierre del período" icon={TicketCheck} tone="blue" onExplore={() => onExplore({ title: "Tickets pendientes", description: "Backlog abierto al cierre del período seleccionado.", params: { scope: "pending" } })} />
        <KpiCard label="Tickets vencidos a la fecha" value={number.format(summary.metrics.overdue)} helper={`${decimal.format(overduePercent)}% del backlog`} icon={AlertTriangle} tone="red" onExplore={() => onExplore({ title: "Tickets vencidos", description: "Tickets pendientes cuya fecha límite ya pasó.", params: { scope: "overdue" } })} />
        <button type="button" className="summary-sla-card" onClick={() => onExplore({ title: "Situación de SLA", description: "Tickets pendientes dentro y fuera de término.", params: { scope: "pending" } })}>
          <div><span>Situación de SLA</span><strong>{decimal.format(summary.metrics.slaCompliance)}% en término</strong></div>
          <div className="summary-sla-track"><i style={{ width: `${inTimePercent}%` }} /><b style={{ width: `${overduePercent}%` }} /></div>
          <div className="summary-sla-labels"><span><i className="dot dot-blue" />En término <strong>{number.format(inTime)}</strong></span><span><i className="dot dot-red" />Vencido <strong>{number.format(summary.metrics.overdue)}</strong></span></div>
        </button>
        <KpiCard label="Promedio de días pendientes" value={decimal.format(summary.metrics.averageAgeDays)} helper="Antigüedad del backlog" icon={Clock3} tone="amber" onExplore={() => onExplore({ title: "Antigüedad del backlog", description: "Tickets pendientes ordenados desde los más antiguos.", params: { scope: "pending" } })} />
      </section>

      <div className="summary-board-grid">
        <Panel
          title="Tickets por organización y estado"
          eyebrow="Backlog actual · Top 8"
          className="summary-company-panel"
          action={(
            <div className="summary-company-actions">
              <div className="chart-legend summary-chart-legend" aria-hidden="true"><span className="legend-blue">Pendientes</span><span className="legend-red">Vencidos</span></div>
              <DrilldownAction onClick={() => onExplore({ title: "Pendientes por organización", description: "Backlog abierto para las organizaciones incluidas en los filtros actuales.", params: { scope: "pending" } })} />
            </div>
          )}
        >
          <div className="chart summary-company-chart" aria-label="Tickets pendientes y vencidos por organización">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.companies} layout="vertical" margin={{ top: 10, right: 18, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="#e6ebf2" /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#7a8799", fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="name" width={145} tickFormatter={(value) => truncate(value, 22)} axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 10 }} /><Tooltip />
                <Bar dataKey="pending" name="Pendientes" fill="#2478ff" radius={[0, 5, 5, 0]} barSize={13} /><Bar dataKey="overdue" name="Vencidos" fill="#ef665f" radius={[0, 5, 5, 0]} barSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="summary-donut-grid">
          <Panel title="Tickets por tipo de tarea" eyebrow="Composición" className="summary-donut-panel" action={<DrilldownAction onClick={() => onExplore({ title: "Tickets por tipo de tarea", description: "Backlog pendiente agrupado por tipo de tarea.", params: { scope: "pending" } })} />}>
            <div className="summary-donut-layout"><div className="summary-donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.categories} dataKey="value" nameKey="name" innerRadius={46} outerRadius={67} paddingAngle={1} stroke="none">{summary.categories.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="summary-donut-center"><strong>{number.format(categoryTotal)}</strong><span>pendientes</span></div></div><div className="summary-donut-legend">{summary.categories.slice(0, 5).map((item, index) => <button type="button" key={item.name} onClick={() => onExplore({ title: item.name, description: "Tickets pendientes de este tipo de tarea.", params: { scope: "pending", category: item.name } })}><i style={{ backgroundColor: COLORS[index % COLORS.length] }} /><span>{truncate(item.name, 18)}</span><strong>{number.format(item.value)}</strong></button>)}</div></div>
          </Panel>

          <Panel title="Tickets por prioridad" eyebrow="Composición" className="summary-donut-panel" action={<DrilldownAction onClick={() => onExplore({ title: "Tickets por prioridad", description: "Backlog pendiente agrupado por prioridad.", params: { scope: "pending" } })} />}>
            <div className="summary-donut-layout"><div className="summary-donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.priorities} dataKey="value" nameKey="name" innerRadius={46} outerRadius={67} paddingAngle={1} stroke="none">{summary.priorities.map((item, index) => <Cell key={item.name} fill={COLORS[(index + 2) % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="summary-donut-center"><strong>{number.format(priorityTotal)}</strong><span>pendientes</span></div></div><div className="summary-donut-legend">{summary.priorities.slice(0, 5).map((item, index) => <button type="button" key={item.name} onClick={() => onExplore({ title: item.name, description: "Tickets pendientes con esta prioridad.", params: { scope: "pending", priority: item.name } })}><i style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }} /><span>{truncate(item.name, 18)}</span><strong>{number.format(item.value)}</strong></button>)}</div></div>
          </Panel>
        </div>

        <Panel title="Antigüedad de tickets" eyebrow="Casos pendientes más antiguos" className="summary-oldest-panel" action={<DrilldownAction onClick={() => onExplore({ title: "Tickets con mayor antigüedad", description: "Backlog ordenado desde los casos más antiguos.", params: { scope: "pending" } })} />}>
          <div className="chart summary-oldest-chart" aria-label="Tickets pendientes con mayor antigüedad"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.oldestOpen} layout="vertical" margin={{ top: 4, right: 16, left: 20, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="#e6ebf2" /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#7a8799", fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="title" width={190} tickFormatter={(value) => truncate(value, 29)} axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 9 }} /><Tooltip formatter={(value) => [`${value} días`, "Antigüedad"]} /><Bar dataKey="ageDays" name="Antigüedad" fill="#ef665f" radius={[0, 5, 5, 0]} barSize={15} /></BarChart></ResponsiveContainer></div>
        </Panel>
      </div>
    </>
  );
}

function AnalysisView({
  summary,
  tickets,
  page,
  sort,
  direction,
  onPage,
  onSort,
  onExplore,
}: {
  summary: DashboardSummary;
  tickets?: TicketListResponse;
  page: number;
  sort: SortKey;
  direction: "asc" | "desc";
  onPage: (page: number) => void;
  onSort: (sort: SortKey) => void;
  onExplore: (selection: DrilldownSelection) => void;
}) {
  const sortLabel = (key: SortKey, label: string) => (
    <button type="button" onClick={() => onSort(key)} className={sort === key ? "active" : ""}>
      {label}{sort === key ? (direction === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <>
      <div className="analysis-grid">
        <Panel
          title="Antigüedad del backlog"
          eyebrow="Tickets abiertos"
          className="aging-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Antigüedad del backlog", description: "Tickets pendientes ordenados por cantidad de días abiertos.", params: { scope: "pending" } })} />}
        >
          <div className="chart chart-analysis">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.aging} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e6ebf2" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#7a8799", fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Tickets" radius={[7, 7, 0, 0]}>
                  {summary.aging.map((entry, index) => <Cell key={entry.name} fill={index > 2 ? "#ef665f" : COLORS[index]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Tickets por tipo"
          eyebrow="Composición"
          className="type-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Tickets por tipo", description: "Backlog pendiente agrupado por tipo de tarea.", params: { scope: "pending" } })} />}
        >
          <div className="chart chart-analysis">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.categories} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="#e6ebf2" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#7a8799", fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tickFormatter={(value) => truncate(value, 16)} axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Tickets" fill="#2478ff" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Estados actuales"
          eyebrow="Distribución"
          className="status-panel"
          action={<DrilldownAction onClick={() => onExplore({ title: "Estados actuales", description: "Todos los tickets abiertos incluidos en los filtros.", params: { scope: "pending" } })} />}
        >
          <div className="status-list">
            {summary.statuses.map((item, index) => {
              const max = summary.statuses[0]?.value || 1;
              return (
                <button type="button" key={item.name} onClick={() => onExplore({ title: item.name, description: "Tickets pendientes en este estado.", params: { scope: "pending", status: item.name } })}>
                  <div><span>{item.name}</span><strong>{number.format(item.value)}</strong></div>
                  <i><b style={{ width: `${(item.value / max) * 100}%`, backgroundColor: COLORS[index % COLORS.length] }} /></i>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel
        title="Detalle de tickets"
        eyebrow={tickets ? `${number.format(tickets.total)} resultados` : "Cargando"}
        className="table-panel"
        action={<div className="table-search"><Search size={15} /><span>Ordenado por {sort === "age" ? "antigüedad" : sort}</span></div>}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>{sortLabel("customer", "Empresa")}</th>
                <th>{sortLabel("priority", "Prioridad")}</th>
                <th>{sortLabel("status", "Estado")}</th>
                <th>{sortLabel("assignee", "Responsable")}</th>
                <th>{sortLabel("createdAt", "Creado")}</th>
                <th>{sortLabel("age", "Antigüedad")}</th>
              </tr>
            </thead>
            <tbody>
              {tickets?.items.map((ticket) => (
                <tr key={ticket.id}>
                  <td><button type="button" className="ticket-link" onClick={() => onExplore({ title: `Ticket ${ticket.id}`, description: "Detalle completo del ticket seleccionado.", params: { ticketId: ticket.id }, initialTicketId: ticket.id })}><strong>{ticket.title}</strong><span>{ticket.id} · {ticket.category}</span></button></td>
                  <td>{ticket.customer}</td>
                  <td><span className="priority-tag">{ticket.priority}</span></td>
                  <td><span className={`status-tag ${ticket.slaBreached ? "status-overdue" : ""}`}>{ticket.status}</span></td>
                  <td>{ticket.assignee}</td>
                  <td>{shortDate.format(new Date(ticket.createdAt))}</td>
                  <td><strong className={ticket.slaBreached ? "text-danger" : ""}>{ticket.ageDays} días</strong></td>
                </tr>
              ))}
              {!tickets?.items.length && <tr><td colSpan={7} className="empty-table">No hay tickets para los filtros seleccionados.</td></tr>}
            </tbody>
          </table>
        </div>
        {tickets && tickets.total > 0 && (
          <footer className="pagination">
            <span>Página {page} de {tickets.pageCount}</span>
            <div>
              <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button>
              <button type="button" aria-label="Página siguiente" disabled={page >= tickets.pageCount} onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button>
            </div>
          </footer>
        )}
      </Panel>
    </>
  );
}

export function DashboardApp({ view }: { view: View }) {
  const [filters, setFilters] = useState<DashboardFilters>(() => getDefaultRange());
  const [options, setOptions] = useState<FilterOptions>();
  const [summary, setSummary] = useState<DashboardSummary>();
  const [tickets, setTickets] = useState<TicketListResponse>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState<{ at: string; tickets: number }>();
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState<number>();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>("age");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [drilldown, setDrilldown] = useState<DrilldownSelection | null>(null);

  const query = useMemo(() => filtersToSearchParams(filters).toString(), [filters]);
  const refreshQuery = reloadKey ? `&refresh=${reloadKey}` : "";
  const updateFilter = useCallback(<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
    setDrilldown(null);
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const stored = window.localStorage.getItem(LAST_MANUAL_REFRESH_KEY);
      if (!stored) return () => { active = false; };
      const value = JSON.parse(stored) as { at?: unknown; tickets?: unknown };
      if (typeof value.at === "string" && typeof value.tickets === "number") {
        queueMicrotask(() => {
          if (active) setLastManualRefresh({ at: value.at as string, tickets: value.tickets as number });
        });
      }
    } catch {
      window.localStorage.removeItem(LAST_MANUAL_REFRESH_KEY);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchJson<DashboardSummary>(`/api/dashboard/summary?${query}${refreshQuery}`, controller.signal),
      options && !reloadKey ? Promise.resolve(options) : fetchJson<FilterOptions>(`/api/filters${reloadKey ? `?refresh=${reloadKey}` : ""}`, controller.signal),
    ])
      .then(([summaryData, optionsData]) => {
        setSummary(summaryData);
        setOptions(optionsData);
        if (reloadKey) setReloadKey(undefined);
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name !== "AbortError") setError(caught.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, refreshQuery, reloadKey, options]);

  useEffect(() => {
    if (view !== "analisis") return;
    const controller = new AbortController();
    fetchJson<TicketListResponse>(
      `/api/tickets?${query}&page=${page}&pageSize=10&sort=${sort}&direction=${direction}${refreshQuery}`,
      controller.signal,
    )
      .then(setTickets)
      .catch((caught) => {
        if (caught instanceof Error && caught.name !== "AbortError") setError(caught.message);
      });
    return () => controller.abort();
  }, [view, query, page, sort, direction, refreshQuery]);

  const handleSort = (next: SortKey) => {
    if (sort === next) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSort(next);
      setDirection(next === "customer" || next === "status" || next === "assignee" ? "asc" : "desc");
    }
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(getDefaultRange());
    setPage(1);
    setDrilldown(null);
  };

  const refreshWarehouse = async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/refresh", { method: "POST", cache: "no-store" });
      const data = await response.json() as { detail?: string; error?: string; refreshedAt?: string; tickets?: number };
      if (!response.ok) throw new Error(data?.detail || data?.error || "No pudimos actualizar los datos.");
      const manualRefresh = { at: data.refreshedAt ?? new Date().toISOString(), tickets: data.tickets ?? 0 };
      setLastManualRefresh(manualRefresh);
      window.localStorage.setItem(LAST_MANUAL_REFRESH_KEY, JSON.stringify(manualRefresh));
      setOptions(undefined);
      setLoading(true);
      setDrilldown(null);
      setReloadKey(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos actualizar los datos.");
    } finally {
      setRefreshing(false);
    }
  };

  const activeFilters = [filters.status, filters.priority, filters.category, filters.customer, filters.team, filters.assignee].filter(Boolean).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><i aria-hidden="true" /><div><strong>Nexo</strong><span>Analítica</span></div></div>
        <nav aria-label="Navegación principal">
          <Link href="/resumen" className={view === "resumen" ? "active" : ""}><LayoutDashboard size={19} /><span>Resumen</span></Link>
          <Link href="/analisis" className={view === "analisis" ? "active" : ""}><BarChart3 size={19} /><span>Análisis</span></Link>
        </nav>
        <div className="sidebar-note"><CircleGauge size={18} /><div><strong>Gestión de SLA</strong><span>Seguimiento diario de tickets</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p>Gestión de relacionamiento</p>
            <h1>{view === "resumen" ? "Situación de tickets pendientes" : "Análisis operativo"}</h1>
          </div>
          <div className="source-status">
            <span className="source-dot" />
            <div><strong>Última consulta</strong><span>{lastManualRefresh ? dateTime.format(new Date(lastManualRefresh.at)) : "Sin consultas manuales"}</span></div>
            {summary?.dataSource === "mock" && <em>Demo</em>}
            <button
              type="button"
              className="refresh-button"
              onClick={refreshWarehouse}
              disabled={refreshing}
              aria-label="Actualizar datos desde el Data Warehouse"
            >
              <RefreshCw size={15} className={refreshing ? "refresh-spin" : ""} />
              <span>{refreshing ? "Actualizando…" : "Actualizar datos"}</span>
            </button>
          </div>
        </header>

        {view === "analisis" && <FiltersBar filters={filters} options={options} activeFilters={activeFilters} onChange={updateFilter} onReset={resetFilters} />}

        {lastManualRefresh && (
          <div className="refresh-banner" role="status"><CheckCircle2 size={17} /><span>Consulta completada a las {dateTime.format(new Date(lastManualRefresh.at))}. Se volvieron a leer {number.format(lastManualRefresh.tickets)} tickets del Data Warehouse.</span></div>
        )}
        {error && summary && (
          <div className="stale-banner error-banner" role="alert"><AlertTriangle size={17} /><span>{error}</span></div>
        )}

        {loading && !summary ? <LoadingState /> : error && !summary ? <ErrorState message={error} onRetry={() => { setError(""); setLoading(true); setReloadKey(Date.now()); }} /> : summary ? (
          view === "resumen" ? (
            <>
              <SummaryBoard summary={summary} onExplore={setDrilldown} />
              <FiltersBar filters={filters} options={options} activeFilters={activeFilters} onChange={updateFilter} onReset={resetFilters} className="summary-filters" />
            </>
          ) : (
            <>
              <section className="kpi-grid" aria-label="Indicadores principales">
                <KpiCard label="Tickets pendientes" value={number.format(summary.metrics.pending)} helper="Backlog al cierre del período" icon={TicketCheck} tone="blue" onExplore={() => setDrilldown({ title: "Tickets pendientes", description: "Backlog abierto al cierre del período seleccionado.", params: { scope: "pending" } })} />
                <KpiCard label="Tickets vencidos" value={number.format(summary.metrics.overdue)} helper={`${decimal.format(summary.metrics.pending ? summary.metrics.overdue / summary.metrics.pending * 100 : 0)}% del backlog`} icon={AlertTriangle} tone="red" onExplore={() => setDrilldown({ title: "Tickets vencidos", description: "Tickets pendientes cuya fecha límite ya pasó.", params: { scope: "overdue" } })} />
                <KpiCard label="Cumplimiento SLA" value={`${decimal.format(summary.metrics.slaCompliance)}%`} helper="Pendientes dentro de término" icon={CheckCircle2} tone="teal" onExplore={() => setDrilldown({ title: "Tickets dentro de término", description: "Backlog pendiente que cumple el plazo registrado.", params: { scope: "inTime" } })} />
                <KpiCard label="Antigüedad promedio" value={`${decimal.format(summary.metrics.averageAgeDays)} d`} helper="Sobre tickets pendientes" icon={Clock3} tone="amber" onExplore={() => setDrilldown({ title: "Antigüedad del backlog", description: "Tickets pendientes ordenados desde los más antiguos.", params: { scope: "pending" } })} />
                <KpiCard label="Resueltos" value={number.format(summary.metrics.resolved)} helper={`Tiempo medio ${formatHours(summary.metrics.averageResolutionHours)}`} icon={Users} tone="navy" onExplore={() => setDrilldown({ title: "Tickets resueltos", description: "Tickets resueltos dentro del período seleccionado.", params: { scope: "resolved" } })} />
              </section>
              <AnalysisView
                summary={summary}
                tickets={tickets}
                page={page}
                sort={sort}
                direction={direction}
                onPage={setPage}
                onSort={handleSort}
                onExplore={setDrilldown}
              />
            </>
          )
        ) : null}
      </main>
      {drilldown && <DrilldownDrawer key={JSON.stringify(drilldown)} selection={drilldown} baseQuery={query} onClose={() => setDrilldown(null)} />}
    </div>
  );
}
