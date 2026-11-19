import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A VPS monta o app só com o que o `.dockerignore` deixa passar, e o
 * `next build` confere os tipos de todo `.ts` que recebe — inclusive teste.
 *
 * Em 19/nov, `src/lib/importacao.test.ts` importava `migration/`, que fica de
 * fora: o CI (que tem o repositório inteiro) passou, e a VPS recusou os dois
 * pushes da entrega 2 sem ninguém ver, por 5 horas.
 */

const RAIZ = posix.join(dirname(fileURLToPath(import.meta.url)).replaceAll("\\", "/"), "../..");

/** As pastas de primeiro nível que a VPS não recebe (linhas simples, sem curinga). */
function pastasForaDaMontagem(): Set<string> {
  return new Set(
    readFileSync(posix.join(RAIZ, ".dockerignore"), "utf8")
      .split(/\r?\n/)
      .map((linha) => linha.trim().replace(/\/$/, ""))
      .filter((linha) => linha && !linha.startsWith("#") && !linha.startsWith("!"))
      .filter((linha) => !/[*?[\]]/.test(linha) && !linha.includes("/")),
  );
}

const primeiraPasta = (caminho: string) => caminho.split("/")[0];

const IMPORTA = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;

describe("o que a VPS monta", () => {
  it("nenhum arquivo que entra na montagem importa de pasta que fica de fora", () => {
    const fora = pastasForaDaMontagem();
    const versionados = execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8" })
      .split("\n")
      .filter((arquivo) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(arquivo))
      .filter((arquivo) => !fora.has(primeiraPasta(arquivo)));

    const quebras: string[] = [];
    for (const arquivo of versionados) {
      const texto = readFileSync(posix.join(RAIZ, arquivo), "utf8");
      for (const [, alvo] of texto.matchAll(IMPORTA)) {
        const destino = posix.normalize(posix.join(posix.dirname(arquivo), alvo));
        if (fora.has(primeiraPasta(destino))) quebras.push(`${arquivo} → ${destino}`);
      }
    }

    expect(quebras).toEqual([]);
  });

  it("a lista de fora é lida do .dockerignore de verdade", () => {
    // Sem isto, um .dockerignore ilegível deixaria o teste acima verde por vazio.
    expect([...pastasForaDaMontagem()]).toEqual(expect.arrayContaining(["migration", "tests"]));
  });
});
