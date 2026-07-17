import type { Ticket } from "./types";

const customers = [
  "Cruz del Sur",
  "Coop. Agrícola y Lechera",
  "Veinticinco de Mayo",
  "Clínica Pasteur",
  "Trans Ecológica S.A.",
  "Ganadera Norte",
  "Fisterra SRL",
  "Tornería Industrial",
  "Consultora Profesional",
  "Grupo Horizonte",
];

const categories = ["Implementación", "Soporte", "Desarrollos", "Abono fijo", "Capacitación"];
const priorities = ["1 · Urgente", "2 · Alta", "3 · Media", "4 · Baja", "5 · Sin asignar"];
const teams = ["Relacionamiento", "Soporte funcional", "Implementación", "Desarrollo"];
const assignees = ["Ana López", "Martín Ríos", "Sofía Pereyra", "Diego Lagos", "Camila Torres", "Sin asignar"];
const openStatuses = ["Abierto", "En análisis", "En espera", "Asignado"];
const titles = [
  "Liquidación de impuestos mensuales",
  "Armado de estructura de gestión",
  "Configuración de circuito de compras",
  "Descripción de proceso comercial",
  "Coaching a usuarios clave",
  "Presentación de avance operativo",
  "Capacitación de responsables",
  "Revisión de permisos y perfiles",
  "Ajuste de reporte de cobranzas",
  "Consulta sobre cierre contable",
  "Validación de interfaz bancaria",
  "Seguimiento de puesta en marcha",
];

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function getMockTickets(now = new Date()): Ticket[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15);
  const updatedAt = new Date(today - 2 * HOUR_MS).toISOString();

  return Array.from({ length: 84 }, (_, index) => {
    const ageDays = ((index * 11) % 92) + 1;
    const created = new Date(today - ageDays * DAY_MS - (index % 8) * HOUR_MS);
    const resolutionDays = (index % 8) + 1;
    const closed = index % 4 === 0 && ageDays > resolutionDays;
    const resolved = closed ? new Date(created.getTime() + resolutionDays * DAY_MS + 3 * HOUR_MS) : null;
    const priority = priorities[index % priorities.length];
    const firstResponseHours = priority.startsWith("1") ? 1 + (index % 3) : 3 + (index % 15);
    const breached = !closed && (ageDays > 22 || index % 5 === 1 || (priority.startsWith("1") && ageDays > 2));

    return {
      id: `TKT-${String(1840 + index)}`,
      title: titles[index % titles.length],
      createdAt: created.toISOString(),
      firstResponseAt: new Date(created.getTime() + firstResponseHours * HOUR_MS).toISOString(),
      resolvedAt: resolved?.toISOString() ?? null,
      status: closed ? (index % 8 === 0 ? "Cerrado" : "Resuelto") : openStatuses[index % openStatuses.length],
      priority,
      category: categories[(index * 3) % categories.length],
      customer: customers[(index * 7) % customers.length],
      team: teams[index % teams.length],
      assignee: assignees[(index * 5) % assignees.length],
      slaBreached: breached,
      updatedAt,
    };
  });
}
