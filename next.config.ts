import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Na VPS o app roda num container (Dockerfile). `standalone` gera um
  // servidor Node enxuto, só com o que o app usa, em `.next/standalone`.
  output: "standalone",
  async headers() {
    return [
      {
        // O worker não pode ficar em cache: um `sw.js` guardado nunca se
        // atualiza, e foi assim que o app antigo prendeu arquivos velhos.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
