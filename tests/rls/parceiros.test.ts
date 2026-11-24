// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { TablesUpdate } from "@/lib/supabase/database.types";

import { entrarComo, type Cliente } from "./clientes";

/**
 * O parceiro no banco (PAR-4, 0068): quem cadastra e o que o banco confere.
 *
 * Nenhuma conta de teste é dona da raiz, então nenhuma cria parceiro: aqui
 * só se prova a recusa. O `insert` pelo dono da raiz mora em
 * `supabase/provas/parceiro-pelo-dono.sql`, que desfaz tudo no fim.
 *
 * As edições são na `parceiro-teste`, pela dona dela (a 0036 deixa a gestão
 * do próprio parceiro editar). Os valores de antes voltam depois de cada
 * teste — também enquanto o teste ainda falha e a edição passa.
 */

const s = Math.random().toString(36).slice(2, 8);

const CAMPOS = [
  "name",
  "legal_name",
  "tax_id",
  "email",
  "phone",
  "phone_country_code",
  "address_country",
] as const;

describe("parceiros no banco", () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let colaborador: Cliente;
  let parceiraId: string;
  let original: TablesUpdate<"organizations">;

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    staff = await entrarComo("staff");
    colaborador = await entrarComo("colaborador");

    // `*`, e não as colunas pelo nome: antes da 0068 as do endereço não
    // existem, e o vermelho tem de vir do teste, não da leitura.
    const { data, error } = await parceiro
      .from("organizations")
      .select("*")
      .eq("slug", "parceiro-teste")
      .single();
    if (error) throw new Error(`Parceira ilegível: ${error.message}`);
    parceiraId = data.id;
    const linha = data as Record<string, unknown>;
    original = Object.fromEntries(
      CAMPOS.filter((c) => c in linha).map((c) => [c, linha[c]]),
    ) as TablesUpdate<"organizations">;
  }, 60_000);

  describe("quem não é dono da Duli não cria parceiro, nem com dado inválido", () => {
    for (const quem of ["parceiro", "colaborador"] as const) {
      it(`a conta ${quem}`, async () => {
        const conta = quem === "parceiro" ? parceiro : colaborador;
        const nome = `Parceiro proibido ${s} ${quem}`;

        const { error } = await conta
          .from("organizations")
          .insert({ name: nome, slug: `proibido-${s}-${quem}`, type: "partner" });

        expect(error?.code).toBe("42501");
        expect(error?.message).toBe("Só o dono da Duli cadastra parceiro.");

        // O colaborador é da raiz e lê todas as organizações.
        const { data } = await colaborador.from("organizations").select("id").eq("name", nome);
        expect(data).toEqual([]);
      });
    }
  });

  describe("a gestão do parceiro edita, e o banco confere os dados", () => {
    afterEach(async () => {
      const { error } = await parceiro
        .from("organizations")
        .update(original)
        .eq("id", parceiraId);
      if (error) throw new Error(`Parceira não restaurada: ${error.message}`);
    });

    const recusa = async (patch: TablesUpdate<"organizations">) => {
      const { error } = await parceiro
        .from("organizations")
        .update(patch)
        .eq("id", parceiraId)
        .select("id");
      return error?.message;
    };

    it("e-mail inválido", async () => {
      expect(await recusa({ email: "invalido" })).toBe("E-mail inválido");
    });

    it("sem país", async () => {
      expect(await recusa({ address_country: "  " })).toBe("Informe o país.");
    });

    it("sem nome", async () => {
      expect(await recusa({ name: " " })).toBe("Informe o nome do parceiro.");
    });

    it("telefone curto", async () => {
      expect(await recusa({ phone: "123" })).toBe("O telefone precisa ter de 8 a 15 dígitos");
    });

    it("documento fiscal longo demais", async () => {
      expect(await recusa({ tax_id: "x".repeat(51) })).toBe(
        "Texto longo demais em um dos campos.",
      );
    });

    it("o DDI é gravado com o +", async () => {
      const { data, error } = await parceiro
        .from("organizations")
        .update({ phone_country_code: "1", phone: "3055550100" })
        .eq("id", parceiraId)
        .select("phone_country_code")
        .single();
      expect(error).toBeNull();
      expect(data!.phone_country_code).toBe("+1");
    });
  });

  it("o staff do parceiro não edita o parceiro", async () => {
    const { data, error } = await staff
      .from("organizations")
      .update({ legal_name: "Editado pelo staff" })
      .eq("id", parceiraId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
