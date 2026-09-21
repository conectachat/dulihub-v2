import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Lora, Open_Sans } from "next/font/google";
import "./globals.css";

import { RegistrarSW } from "@/components/registrar-sw";
import { Toaster } from "@/components/ui/sonner";
import { VERSAO } from "@/lib/versao";

/**
 * Tipografia da marca, do Manual de Identidade Visual:
 * "Lora speaks, Open Sans explains, IBM Plex Mono states the facts."
 *
 * Carregadas pelo Google Fonts em vez dos TTF em `marca/Fontes`: assim o Next
 * hospeda os arquivos junto do app — sem chamada a servidor de terceiro, sem
 * salto de fonte no carregamento — e baixa só os pesos usados.
 */
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Duli Hub",
  description: "Sistema de gestão — Duli Consulting",
  // Instalável: o manifesto é gerado por `src/app/manifest.ts`.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Duli Hub", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

/** Azul da marca na barra do sistema quando o app está instalado. */
export const viewport: Viewport = {
  themeColor: "#022b64",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${openSans.variable} ${lora.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Canal de aviso para ação de linha, que não tem onde escrever. */}
        <Toaster position="bottom-right" />
        <RegistrarSW versao={VERSAO} />
      </body>
    </html>
  );
}
