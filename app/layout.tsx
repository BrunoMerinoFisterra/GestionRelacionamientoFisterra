import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const description = "Tablero interno de tickets, backlog y cumplimiento de SLA.";

  return {
    metadataBase,
    title: {
      default: "Gestión de relacionamiento",
      template: "%s · Gestión de relacionamiento",
    },
    description,
    openGraph: {
      title: "Gestión de relacionamiento",
      description,
      type: "website",
      images: [{ url: "/og.png", width: 1744, height: 909, alt: "Gestión de relacionamiento · Tickets, backlog y SLA" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Gestión de relacionamiento",
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
