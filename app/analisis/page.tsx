import type { Metadata } from "next";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export const metadata: Metadata = {
  title: "Análisis",
};

export default function AnalysisPage() {
  return <DashboardApp view="analisis" />;
}
