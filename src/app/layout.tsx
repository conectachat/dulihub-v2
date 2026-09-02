import type { Metadata } from "next";
import { IBM_Plex_Mono, Lora, Open_Sans } from "next/font/google";
import "./globals.css";

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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${openSans.variable} ${lora.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
