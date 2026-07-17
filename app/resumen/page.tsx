import type { Metadata } from "next";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export const metadata: Metadata = {
  title: "Resumen",
};

export default function SummaryPage() {
  return <DashboardApp view="resumen" />;
}
