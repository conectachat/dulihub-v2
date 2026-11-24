"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert } from "lucide-react";

import { AvisoDeDuplicado } from "@/components/aviso-de-duplicado";
import { CamposDoContatoNovo } from "@/components/campos-do-contato-novo";
import { FieldError } from "@/components/field-error";
import { FormDialog } from "@/components/form-dialog";
import { ContatoEscolhido, ModosDoContato, type ModoDoContato } from "@/components/modos-do-contato";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buscarContatosParaCliente,
  criarCliente,
  type ContatoParaCliente,
} from "@/features/clientes/novo-cliente-actions";
import { restorePerson } from "@/features/people/actions";
import { telefoneCompleto } from "@/lib/formatar";
import {
  CAMPO_CONFIRMAR_PARECIDO,
  type ContatoParecido,
  type EstadoComConfirmacao,
  type Homonimo,
} from "@/lib/parecidos";
import { enderecoDaPessoa, enderecoDoNovoCliente } from "@/lib/pessoa";

/** A espera entre teclas, a mesma de `BuscaNaUrl`. */
const ESPERA_DA_BUSCA = 350;

type Resultado = { linhas: ContatoParaCliente[]; total: number; error: string | null };

/**
 * Novo cliente (CLI-15): para o cliente antigo, que não passou pelo funil. Só
 * a gestão vê o botão; quem decide é o banco (`criar_cliente`).
 *
 * - **Contato existente:** busca no servidor (até 20, com o total), já ao
 *   abrir. A espera roda num timer do `onChange`, e a resposta que chega
 *   depois de outra mais nova é descartada. A caixa de busca não é campo do
 *   formulário, e o Enter nela não envia.
 * - **Contato novo:** os mesmos campos da Nova oportunidade.
 * - **Parecido** (CON-4): "Sim" usa o existente — se ele já é cliente, abre o
 *   perfil dele, sem gravar; na lixeira, restaura antes.
 * - **Parceiro** (PAR-5): o parceiro e só o nome do cliente — o contato é o
 *   do parceiro. O mesmo nome no mesmo parceiro pergunta antes. A lista vem
 *   do servidor (`parceirosVisiveis`), então parceiro cadastrado offline só
 *   aparece depois de subir.
 */
export function NovoClienteDialog({
  parceiros = [],
  podeCadastrarParceiro = false,
}: {
  parceiros?: { id: string; nome: string }[];
  /** Só o dono da Duli cadastra parceiro: só ele vê o link para a Configuração. */
  podeCadastrarParceiro?: boolean;
} = {}) {
  const router = useRouter();
  const [modo, setModo] = useState<ModoDoContato>("existente");
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const ultimaBusca = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function buscar(texto: string) {
    const minha = ++ultimaBusca.current;
    let resposta: Resultado;
    try {
      resposta = await buscarContatosParaCliente(texto);
    } catch {
      resposta = { linhas: [], total: 0, error: "Não foi possível buscar. Tente de novo." };
    }
    // Chegou depois de uma busca mais nova (ou de uma tecla nova): não vale.
    if (minha === ultimaBusca.current) setResultado(resposta);
  }

  function recomecar() {
    if (espera.current) clearTimeout(espera.current);
    setModo("existente");
    setEscolhido(null);
    setTermo("");
    setResultado(null);
    void buscar("");
  }

  function aoDigitar(texto: string) {
    setTermo(texto);
    // A tecla já invalida a resposta que ainda está a caminho.
    ultimaBusca.current += 1;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => void buscar(texto), ESPERA_DA_BUSCA);
  }

  async function restaurar(id: string) {
    const dados = new FormData();
    dados.set("id", id);
    return restorePerson(dados);
  }

  function usarExistente(
    id: string,
    estagio: string,
    parecidos: ContatoParecido[],
    reenviarCom: (extra: Record<string, string>) => void,
  ) {
    if (estagio === "client") {
      router.push(enderecoDoNovoCliente(id));
      return;
    }
    setModo("existente");
    setEscolhido({ id, nome: parecidos.find((p) => p.id === id)?.nome ?? "" });
    // O formulário ainda é o do contato novo: o extra troca o modo e o contato.
    reenviarCom({ modo_contato: "existente", person_id: id });
  }

  return (
    <FormDialog<EstadoComConfirmacao>
      acao={criarCliente}
      titulo="Novo cliente"
      descricao="Para o cliente que não passou pelo funil. Quem está no funil vira cliente pelo Ganho."
      salvar="Criar cliente"
      pendente="Criando..."
      aoAbrir={recomecar}
      gatilho={
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Novo cliente
        </Button>
      }
      aviso={(estado, { reenviarCom }) => {
        if (estado.homonimos?.length) {
          return (
            <AvisoDeHomonimo
              homonimos={estado.homonimos}
              parceiro={estado.parceiro ?? ""}
              aoCriarMesmoAssim={() => reenviarCom({ [CAMPO_CONFIRMAR_PARECIDO]: "1" })}
            />
          );
        }
        if (!estado.parecidos?.length) return null;
        const parecidos = estado.parecidos;
        return (
          <AvisoDeDuplicado
            parecidos={parecidos}
            modo="criar"
            aoUsarExistente={(id, estagio) => usarExistente(id, estagio, parecidos, reenviarCom)}
            aoRestaurar={restaurar}
            aoGravarMesmoAssim={() => reenviarCom({ [CAMPO_CONFIRMAR_PARECIDO]: "1" })}
          />
        );
      }}
    >
      <ModosDoContato modo={modo} aoTrocar={setModo} rotulo="Contato do cliente" comParceiro />

      {modo === "parceiro" ? (
        <CamposDoClienteDeParceiro parceiros={parceiros} podeCadastrar={podeCadastrarParceiro} />
      ) : modo === "novo" ? (
        <CamposDoContatoNovo />
      ) : escolhido ? (
        <ContatoEscolhido id={escolhido.id} nome={escolhido.nome} aoTrocar={() => setEscolhido(null)} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="busca-contato">Buscar contato</Label>
          <Input
            id="busca-contato"
            value={termo}
            placeholder="Nome, e-mail ou telefone"
            autoComplete="off"
            onChange={(e) => aoDigitar(e.target.value)}
            onKeyDown={(e) => {
              // A busca não envia: o envio é o "Criar cliente".
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <FieldError mensagem={resultado?.error ?? null} pequeno />
          {resultado === null ? <p className="text-sm text-muted-foreground">Buscando...</p> : null}
          {resultado && !resultado.error ? (
            resultado.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato encontrado.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {resultado.linhas.map((c) => {
                  const telefone = telefoneCompleto(c.phone_country_code, c.phone);
                  // O nome acessível leva o e-mail e o telefone: é o que separa
                  // duas pessoas com o mesmo nome.
                  const nomeAcessivel = [c.full_name, c.email, telefone].filter(Boolean).join(", ");
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-label={`Escolher ${nomeAcessivel}`}
                        className="flex w-full flex-col items-start rounded-2xl border px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => setEscolhido({ id: c.id, nome: c.full_name })}
                      >
                        <span className="font-medium">{c.full_name}</span>
                        {c.email ? (
                          <span className="text-xs break-all text-muted-foreground">{c.email}</span>
                        ) : null}
                        {telefone ? <span className="text-xs text-muted-foreground">{telefone}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
          {resultado && resultado.total > resultado.linhas.length ? (
            <p className="text-xs text-muted-foreground">
              {`Mostrando ${resultado.linhas.length} de ${resultado.total}; refine a busca.`}
            </p>
          ) : null}
        </div>
      )}

      <p className="text-sm text-muted-foreground">Não tem volta: cliente não volta a ser lead.</p>
    </FormDialog>
  );
}

/** O parceiro e o nome: o resto do contato é o do parceiro. */
function CamposDoClienteDeParceiro({
  parceiros,
  podeCadastrar,
}: {
  parceiros: { id: string; nome: string }[];
  podeCadastrar: boolean;
}) {
  if (parceiros.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum parceiro cadastrado. Cadastre em{" "}
        {podeCadastrar ? (
          <Link href="/configuracoes/parceiros" className="font-medium text-primary underline underline-offset-4">
            Configuração › Parceiros
          </Link>
        ) : (
          "Configuração › Parceiros"
        )}
        .
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="nc-parceiro">Parceiro *</Label>
        <NativeSelect id="nc-parceiro" name="parceiro_id" defaultValue="" required>
          <option value="" disabled>
            Escolha o parceiro
          </option>
          {parceiros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="nc-nome-do-cliente">Nome do cliente *</Label>
        <Input id="nc-nome-do-cliente" name="nome_do_cliente" autoComplete="off" required />
      </div>
    </>
  );
}

/**
 * O mesmo cliente subido duas vezes numa carga grande: o mesmo nome, vindo do
 * mesmo parceiro, pergunta antes (desenho §5.2).
 */
function AvisoDeHomonimo({
  homonimos,
  parceiro,
  aoCriarMesmoAssim,
}: {
  homonimos: Homonimo[];
  parceiro: string;
  aoCriarMesmoAssim: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-2xl border bg-warning/15 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="h-4 w-4 shrink-0 text-brand" />
        Já existe um cliente com esse nome vindo de {parceiro}.
      </p>
      <ul className="space-y-1">
        {homonimos.map((h) => (
          <li key={h.id}>
            <Link
              href={enderecoDaPessoa(h.id, "client")}
              className="font-medium text-primary underline underline-offset-4"
            >
              {h.nome}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={aoCriarMesmoAssim}>
          Criar mesmo assim
        </Button>
      </div>
    </div>
  );
}
