import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CadastroDoContato, LinkDaFicha } from "@/features/cadastro/queries";
import {
  linkDoWhatsApp,
  mensagemDoWhatsApp,
  ROTULO_DA_SITUACAO,
  situacaoDoCadastro,
  urlDaFicha,
} from "@/features/cadastro/regras";
import { ESTADOS_CIVIS, RELACIONAMENTOS, SEXOS } from "@/features/cadastro/schema";
import { formatarCep, formatarCpf } from "@/lib/documentos";
import { formatarData, formatarDia } from "@/lib/formatar";

import { Conferir, EditarCadastro, GerarLink, LinkAberto } from "./controles-da-ficha";

/**
 * "Dados cadastrais" — o que vai para o contrato, e o link que o lead recebe
 * para preencher.
 *
 * As colunas existem em `people` desde a 0001 e nenhuma tela as mostrava: o
 * Renato recebia a ficha em PDF e redigitava no contrato. Aqui elas aparecem
 * como vão ser usadas — CPF com máscara, endereço em duas linhas.
 */

const rotulo = (lista: Record<string, string>, valor: string | null) =>
  valor ? (lista[valor] ?? valor) : null;

function Item({ nome, valor }: { nome: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{nome}</dt>
      <dd className="text-sm">{valor || "—"}</dd>
    </div>
  );
}

export function DadosCadastrais({
  personId,
  cadastro,
  origem,
  agora = new Date(),
  parceiro = null,
}: {
  personId: string;
  cadastro: CadastroDoContato;
  /** `https://dulihub…`, para montar o endereço público da ficha. */
  origem: string;
  agora?: Date;
  /**
   * O parceiro do cliente de parceiro (PAR-7): sem link da ficha — o Renato
   * não fala com o cliente — e sem contato próprio no Editar.
   */
  parceiro?: string | null;
}) {
  const { ficha, dependentes, fichaRecebida: recebida, linkAtual: link } = cadastro;
  // A ficha recebida e o link atual são coisas separadas (I4): o selo olha os dois.
  const situacao = situacaoDoCadastro(
    [recebida, link].filter((l): l is LinkDaFicha => l !== null),
    agora,
  );
  const vencido = link !== null && new Date(link.expires_at).getTime() <= agora.getTime();

  // Nome, e-mail e telefone já moram no cartão "Contato"; aqui conta o resto.
  const temDado =
    dependentes.length > 0 ||
    Object.entries(ficha).some(
      ([campo, valor]) =>
        valor !== null &&
        !["full_name", "email", "phone", "phone_country_code"].includes(campo),
    );

  const rua = [ficha.address_street, ficha.address_number].filter(Boolean).join(", ");
  const linha1 = [rua, ficha.address_complement].filter(Boolean).join(" — ");
  const cidade = [ficha.address_city, ficha.address_state].filter(Boolean).join("/");
  const linha2 = [
    ficha.address_district,
    cidade,
    ficha.address_country,
    ficha.address_postal_code ? `CEP ${formatarCep(ficha.address_postal_code)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const url = link ? urlDaFicha(origem, link.token) : "";

  return (
    // Âncora dos atalhos do CRM e da tela Início.
    <Card id="dados-cadastrais" className="scroll-mt-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Dados cadastrais</CardTitle>
          {situacao !== "sem-link" ? (
            <Badge variant={situacao === "recebida" ? "default" : "secondary"}>
              {ROTULO_DA_SITUACAO[situacao]}
            </Badge>
          ) : null}
        </div>
        <EditarCadastro
          personId={personId}
          ficha={ficha}
          dependentes={dependentes}
          semContato={parceiro !== null}
        />
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ----------------------------------------------- a ficha recebida */}
        {recebida?.submitted_at ? (
          <div className="space-y-3 rounded-2xl border p-3">
            {recebida.reviewed_at ? (
              <p className="text-sm text-muted-foreground">
                Ficha preenchida pelo cliente em {formatarData(recebida.submitted_at)} e
                conferida.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  O cliente preencheu a ficha em {formatarData(recebida.submitted_at)}.
                  Confira os dados abaixo antes de montar o contrato.
                </p>
                <Conferir id={recebida.id} />
              </>
            )}
          </div>
        ) : null}

        {/* ------------------------------------------------- o link da ficha */}
        {parceiro !== null ? (
          <p className="rounded-2xl border p-3 text-sm text-muted-foreground">
            Cliente de {parceiro}: os dados cadastrais são lançados aqui, em Editar.
          </p>
        ) : (
        <div className="space-y-3 rounded-2xl border p-3">
          {link?.negocio ? (
            // O link com a forma de pagamento é do negócio: cancela-se lá (P8).
            <>
              <p className="text-sm text-muted-foreground">
                Link da ficha enviado com a forma do negócio {link.negocio.title}
                {vencido ? ", vencido sem resposta" : ""}.
              </p>
              <Link
                href={`/crm/${link.negocio.id}`}
                className="inline-flex text-sm font-medium text-primary hover:underline"
              >
                Abrir o negócio
              </Link>
            </>
          ) : null}

          {link && !link.negocio && !vencido ? (
            <>
              <p className="text-sm text-muted-foreground">
                Link enviado ao cliente — vale até {formatarData(link.expires_at)} e
                funciona uma vez só.
              </p>
              <LinkAberto
                id={link.id}
                url={url}
                whatsapp={linkDoWhatsApp(
                  ficha.phone_country_code,
                  ficha.phone,
                  mensagemDoWhatsApp(ficha.full_name ?? "", url),
                )}
              />
            </>
          ) : null}

          {link && !link.negocio && vencido ? (
            <>
              <p className="text-sm text-muted-foreground">
                O link venceu em {formatarData(link.expires_at)} sem resposta. Gere
                outro para enviar de novo.
              </p>
              <GerarLink personId={personId} novo />
            </>
          ) : null}

          {!link ? (
            <>
              <p className="text-sm text-muted-foreground">
                {recebida
                  ? "Para o cliente corrigir algo, gere outro link."
                  : "Envie a ficha para o cliente preencher pelo celular. Ao enviar, os dados entram aqui sozinhos."}
              </p>
              <GerarLink personId={personId} novo={recebida !== null} />
            </>
          ) : null}
        </div>
        )}

        {/* ---------------------------------------------------------- a ficha */}
        {temDado ? (
          <>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Item
                nome="Data de nascimento"
                valor={ficha.birth_date ? formatarDia(ficha.birth_date) : null}
              />
              <Item nome="CPF" valor={ficha.tax_id ? formatarCpf(ficha.tax_id) : null} />
              <Item
                nome="RG"
                valor={
                  [ficha.national_id, ficha.national_id_issuer].filter(Boolean).join(" · ") ||
                  null
                }
              />
              <Item nome="Sexo" valor={rotulo(SEXOS, ficha.gender)} />
              <Item nome="Estado civil" valor={rotulo(ESTADOS_CIVIS, ficha.marital_status)} />
              <Item nome="Naturalidade" valor={ficha.birthplace} />
              <Item nome="Nacionalidade" valor={ficha.nationality} />
            </dl>

            <div>
              <p className="text-xs text-muted-foreground">Endereço</p>
              {linha1 || linha2 ? (
                <p className="text-sm">
                  {linha1}
                  {linha1 && linha2 ? <br /> : null}
                  {linha2}
                </p>
              ) : (
                <p className="text-sm">—</p>
              )}
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Dependentes ({dependentes.length})
              </p>
              {dependentes.length === 0 ? (
                <p className="text-sm">Nenhum</p>
              ) : (
                <ul className="mt-1 divide-y">
                  {dependentes.map((d, i) => (
                    <li key={i} className="py-1.5 text-sm">
                      <span className="font-medium">{d.full_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {RELACIONAMENTOS[d.relationship] ?? d.relationship} ·{" "}
                        {formatarDia(d.birth_date)} · {d.birth_country}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {parceiro !== null
              ? "Nenhum dado cadastral ainda."
              : "Nenhum dado cadastral ainda. Gere o link para o cliente preencher, ou use Editar para lançar aqui."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
