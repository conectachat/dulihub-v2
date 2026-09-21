import type { MetadataRoute } from "next";

/**
 * O que faz o app ser instalável: ícone na tela de início, janela própria,
 * sem barra do navegador.
 *
 * No iPhone, instalar não é enfeite: o Safari apaga os dados guardados de
 * sites que ficam 7 dias sem uso, **exceto** os instalados na tela de
 * início. É o que vai segurar o modo offline (Estágio 2 em diante).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duli Hub — Duli Consulting",
    short_name: "Duli Hub",
    description: "Processos de imigração, contatos e documentos da Duli Consulting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "pt-BR",
    dir: "ltr",
    background_color: "#ffffff",
    // Azul da marca: é a cor da barra do sistema com o app aberto.
    theme_color: "#022b64",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separados dos de cima porque o Android corta o ícone em círculo:
      // estes têm margem, os outros vão até a borda.
      { src: "/icon-mascara-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-mascara-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
