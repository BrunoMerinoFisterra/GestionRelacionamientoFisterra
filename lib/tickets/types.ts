export interface Ticket {
  id: string;
  title: string;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  status: string;
  priority: string;
  category: string;
  customer: string;
  team: string;
  assignee: string;
  slaBreached: boolean;
  updatedAt: string;
}

export interface DashboardFilters {
  from: string;
  to: string;
  status?: string;
  priority?: string;
  category?: string;
  customer?: string;
  team?: string;
  assignee?: string;
}

export interface DistributionPoint {
  name: string;
  value: number;
}

export interface CompanyPoint {
  name: string;
  pending: number;
  overdue: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  created: number;
  resolved: number;
  backlog: number;
}

export interface OldestTicket {
  id: string;
  title: string;
  customer: string;
  priority: string;
  ageDays: number;
  slaBreached: boolean;
}

export interface DashboardSummary {
  metrics: {
    pending: number;
    overdue: number;
    created: number;
    resolved: number;
    slaCompliance: number;
    averageAgeDays: number;
    averageFirstResponseHours: number;
    averageResolutionHours: number;
  };
  trend: TrendPoint[];
  priorities: DistributionPoint[];
  categories: DistributionPoint[];
  statuses: DistributionPoint[];
  aging: DistributionPoint[];
  companies: CompanyPoint[];
  oldestOpen: OldestTicket[];
  sourceUpdatedAt: string;
  generatedAt: string;
  dataSource: "mock" | "postgres";
}

export interface FilterOptions {
  statuses: string[];
  priorities: string[];
  categories: string[];
  customers: string[];
  teams: string[];
  assignees: string[];
  sourceUpdatedAt: string;
  dataSource: "mock" | "postgres";
}

export interface TicketListResponse {
  items: Array<Ticket & { ageDays: number }>;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  sourceUpdatedAt: string;
  dataSource: "mock" | "postgres";
}

export type TicketDrilldownScope = "all" | "pending" | "overdue" | "inTime" | "created" | "resolved";
