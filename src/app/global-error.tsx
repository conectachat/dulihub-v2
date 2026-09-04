"use client";

/**
 * Último recurso: falha no próprio layout raiz.
 *
 * Substitui o documento inteiro, então precisa trazer o próprio `<html>` e
 * `<body>` — e **não recebe a folha de estilo nem as fontes**, daí o estilo
 * embutido. Também não aparece em desenvolvimento, onde o Next mostra a
 * sobreposição de erro. Por isso: curto, sem dependência, e sem nada que
 * possa falhar por sua vez.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          background: "#fbfaf8",
          color: "#3e4c63",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            O sistema não conseguiu carregar
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#8a97aa" }}>
            Seus dados estão a salvo. Recarregue a página; se repetir, avise
            quem cuida do sistema{error.digest ? ` e informe o código ${error.digest}` : ""}.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#022b64",
              color: "#fbfaf8",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
