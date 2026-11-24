"use client";

import { Fragment, startTransition, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { FieldError } from "@/components/field-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoDaFicha } from "@/features/cadastro/estado";
import {
  ESTADOS_CIVIS,
  fichaDoFormulario,
  MAXIMO_DE_DEPENDENTES,
  RELACIONAMENTOS,
  SEXOS,
  type CampoDaFicha,
  type Dependente,
} from "@/features/cadastro/schema";
import { DDI_PADRAO } from "@/lib/contato";
import { formatarCep, formatarCpf } from "@/lib/documentos";
import { novoId } from "@/lib/id";
import { cn } from "@/lib/utils";

/**
 * A ficha de cadastro, campo por campo — a mesma tela para o lead, na página
 * pública, e para a equipe, na ficha do contato. Uma só de propósito: duas
 * versões do mesmo formulário divergem, e a que o cliente vê é a que ninguém
 * da equipe abre.
 *
 * **Não usa `<form action>`.** O React limpa os campos de um formulário depois
 * que a ação roda; numa ficha de vinte campos, uma recusa do servidor apagaria
 * tudo o que a pessoa digitou no celular. Aqui o envio é um `onSubmit`: valida
 * no navegador (as mesmas regras do servidor, `fichaDoFormulario`), aponta o
 * erro no campo, e só então chama a ação — que confere de novo.
 */

type Valores = Partial<Record<CampoDaFicha, string | null>>;

type Linha = { chave: string } & Partial<Dependente>;

function Campo({
  nome,
  rotulo,
  erro,
  obrigatorio,
  className,
  ...input
}: {
  nome: string;
  rotulo: string;
  erro?: string;
  obrigatorio?: boolean;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={nome}>
        {rotulo}
        {obrigatorio ? " *" : ""}
      </Label>
      <Input id={nome} name={nome} aria-invalid={erro ? true : undefined} {...input} />
      <FieldError mensagem={erro} pequeno />
    </div>
  );
}

function Escolha({
  nome,
  rotulo,
  opcoes,
  valor,
  erro,
  obrigatorio,
}: {
  nome: string;
  rotulo: string;
  opcoes: Record<string, string>;
  valor?: string | null;
  erro?: string;
  obrigatorio?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={nome}>
        {rotulo}
        {obrigatorio ? " *" : ""}
      </Label>
      <NativeSelect
        id={nome}
        name={nome}
        defaultValue={valor ?? ""}
        aria-invalid={erro ? true : undefined}
      >
        <option value="">Selecione</option>
        {Object.entries(opcoes).map(([codigo, texto]) => (
          <option key={codigo} value={codigo}>
            {texto}
          </option>
        ))}
      </NativeSelect>
      <FieldError mensagem={erro} pequeno />
    </div>
  );
}

function Secao({ titulo, ajuda, children }: {
  titulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="font-serif text-base font-medium">{titulo}</legend>
      {ajuda ? <p className="text-sm text-muted-foreground">{ajuda}</p> : null}
      {children}
    </fieldset>
  );
}

export function FormularioDoCadastro({
  modo,
  inicial,
  dependentes = [],
  enviar,
  aoGravar,
  declaracao,
  rotuloDoEnvio,
  rotuloEnviando = "Enviando...",
  rodape,
  aviso,
  semContato = false,
}: {
  /** `completa`: o lead preenche tudo. `parcial`: a equipe completa aos poucos. */
  modo: "completa" | "parcial";
  /**
   * Cliente de parceiro (PAR-7): sem e-mail, DDI e telefone — o contato é o
   * do parceiro. O servidor decide pela linha da pessoa; aqui é só a tela.
   */
  semContato?: boolean;
  inicial: Valores;
  dependentes?: Dependente[];
  enviar: (formData: FormData) => Promise<EstadoDaFicha>;
  aoGravar: () => void;
  /** Com texto, exige o aceite antes de enviar — a porta do lead. */
  declaracao?: string;
  rotuloDoEnvio: string;
  /** O que o botão diz enquanto grava. */
  rotuloEnviando?: string;
  /** Botões ao lado do envio (o "Cancelar" do diálogo). */
  rodape?: React.ReactNode;
  /**
   * Só a porta da equipe: a pergunta que a ação devolveu sem gravar (contato
   * parecido, CON-4), desenhada acima do erro. `reenviarCom` manda o mesmo
   * formulário de novo com o campo de confirmação. Quem fecha o diálogo é
   * quem o abriu — o formulário não é dono dele.
   */
  aviso?: (
    estado: EstadoDaFicha,
    acoes: { reenviarCom: (extra: Record<string, string>) => void },
  ) => React.ReactNode;
}) {
  // Estado, não `ref`: o aviso é desenhado com `reenviarCom`, e ler `ref`
  // durante o desenho é o que o compilador do React proíbe.
  const [formulario, setFormulario] = useState<HTMLFormElement | null>(null);
  // Chave estável para as linhas que já vêm: id aleatório aqui sairia
  // diferente no servidor e no navegador, e a hidratação reclamaria.
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    dependentes.map((d, i) => ({ chave: `inicial-${i}`, ...d })),
  );
  const [estado, setEstado] = useState<EstadoDaFicha>({ error: null });
  const [enviando, iniciar] = useTransition();
  // Cada resposta com parecidos ganha um número, e o aviso dela confirma uma
  // vez só (I1) — o mesmo que o `FormDialog` faz com a marca da resposta.
  const [controleDoAviso, setControleDoAviso] = useState({ numero: 0, confirmado: -1 });
  // Mexeu no formulário depois do último envio, mesmo com ele em curso? O
  // aviso fala de um valor que não é mais o da tela: some, e o próximo envio
  // confere de novo (I2). Repetir `true` não redesenha a ficha a cada tecla.
  const [alterado, setAlterado] = useState(false);

  const erros = estado.campos ?? {};
  const exige = modo === "completa";

  function recusar(novo: EstadoDaFicha) {
    setEstado(novo);
    // Leva o olho (e o teclado do celular) ao primeiro campo com problema.
    requestAnimationFrame(() => {
      formulario
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
  }

  function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);

    const ficha = fichaDoFormulario(formData, modo, undefined, { semContato });
    const campos = ficha.ok ? {} : { ...ficha.campos };
    if (declaracao && formData.get("aceite") !== "on") {
      campos.aceite = "Marque para enviar";
    }
    if (Object.keys(campos).length > 0) {
      recusar({ error: "Confira os campos destacados.", campos });
      return;
    }

    gravar(formData);
  }

  function gravar(formData: FormData) {
    setAlterado(false);
    iniciar(async () => {
      const resposta = await enviar(formData);
      // Depois do `await`, a atualização só entra na transição se for
      // embrulhada de novo. Sem isso o aviso aparecia com `enviando` ainda
      // verdadeiro, e o clique rápido em "Salvar mesmo assim" se perdia.
      startTransition(() => {
        if (resposta.error) recusar(resposta);
        // Com parecidos, não gravou: mostra a pergunta e espera.
        else if (resposta.parecidos?.length) {
          setEstado(resposta);
          setControleDoAviso((a) => ({ ...a, numero: a.numero + 1 }));
        } else aoGravar();
      });
    });
  }

  function reenviarCom(extra: Record<string, string>) {
    if (!formulario || enviando || controleDoAviso.confirmado === controleDoAviso.numero) return;
    setControleDoAviso((a) => ({ ...a, confirmado: a.numero }));
    const formData = new FormData(formulario);
    for (const [campo, valor] of Object.entries(extra)) formData.set(campo, valor);
    gravar(formData);
  }

  return (
    <form
      ref={setFormulario}
      onSubmit={aoEnviar}
      onChange={() => setAlterado(true)}
      noValidate
      className="space-y-8"
    >
      <Secao titulo="Dados do contratante">
        <Campo
          nome="full_name"
          rotulo="Nome completo"
          obrigatorio
          defaultValue={inicial.full_name ?? ""}
          autoComplete="name"
          erro={erros.full_name}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="birth_date"
            rotulo="Data de nascimento"
            type="date"
            obrigatorio={exige}
            defaultValue={inicial.birth_date ?? ""}
            autoComplete="bday"
            erro={erros.birth_date}
          />
          <Campo
            nome="tax_id"
            rotulo="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            obrigatorio={exige}
            defaultValue={formatarCpf(inicial.tax_id)}
            erro={erros.tax_id}
          />
          <Campo
            nome="national_id"
            rotulo="RG"
            obrigatorio={exige}
            defaultValue={inicial.national_id ?? ""}
            erro={erros.national_id}
          />
          <Campo
            nome="national_id_issuer"
            rotulo="Órgão expedidor"
            placeholder="SSP/MA"
            obrigatorio={exige}
            defaultValue={inicial.national_id_issuer ?? ""}
            erro={erros.national_id_issuer}
          />
          <Escolha
            nome="gender"
            rotulo="Sexo"
            opcoes={SEXOS}
            obrigatorio={exige}
            valor={inicial.gender}
            erro={erros.gender}
          />
          <Escolha
            nome="marital_status"
            rotulo="Estado civil"
            opcoes={ESTADOS_CIVIS}
            obrigatorio={exige}
            valor={inicial.marital_status}
            erro={erros.marital_status}
          />
          <Campo
            nome="birthplace"
            rotulo="Naturalidade"
            placeholder="Cidade e estado onde nasceu"
            obrigatorio={exige}
            defaultValue={inicial.birthplace ?? ""}
            erro={erros.birthplace}
          />
          <Campo
            nome="nationality"
            rotulo="Nacionalidade"
            placeholder="Brasileira"
            obrigatorio={exige}
            defaultValue={inicial.nationality ?? ""}
            erro={erros.nationality}
          />
        </div>

        {semContato ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="email"
            rotulo="E-mail"
            type="email"
            obrigatorio
            defaultValue={inicial.email ?? ""}
            autoComplete="email"
            erro={erros.email}
          />
          <div className="grid grid-cols-[5.5rem_1fr] gap-3">
            <Campo
              nome="phone_country_code"
              rotulo="DDI"
              placeholder={DDI_PADRAO}
              obrigatorio
              defaultValue={inicial.phone_country_code ?? DDI_PADRAO}
              erro={erros.phone_country_code}
            />
            <Campo
              nome="phone"
              rotulo="Telefone"
              inputMode="tel"
              obrigatorio
              defaultValue={inicial.phone ?? ""}
              autoComplete="tel-national"
              erro={erros.phone}
            />
          </div>
        </div>
        )}
      </Secao>

      <Secao titulo="Endereço">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="address_postal_code"
            rotulo="CEP"
            inputMode="numeric"
            obrigatorio={exige}
            defaultValue={formatarCep(inicial.address_postal_code)}
            autoComplete="postal-code"
            erro={erros.address_postal_code}
          />
          <Campo
            nome="address_country"
            rotulo="País"
            obrigatorio={exige}
            defaultValue={inicial.address_country ?? "Brasil"}
            autoComplete="country-name"
            erro={erros.address_country}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Campo
            nome="address_street"
            rotulo="Endereço"
            placeholder="Rua, avenida…"
            obrigatorio={exige}
            defaultValue={inicial.address_street ?? ""}
            autoComplete="address-line1"
            erro={erros.address_street}
          />
          <Campo
            nome="address_number"
            rotulo="Número"
            obrigatorio={exige}
            defaultValue={inicial.address_number ?? ""}
            erro={erros.address_number}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="address_complement"
            rotulo="Complemento"
            defaultValue={inicial.address_complement ?? ""}
            autoComplete="address-line2"
            erro={erros.address_complement}
          />
          <Campo
            nome="address_district"
            rotulo="Bairro"
            obrigatorio={exige}
            defaultValue={inicial.address_district ?? ""}
            erro={erros.address_district}
          />
          <Campo
            nome="address_city"
            rotulo="Cidade"
            obrigatorio={exige}
            defaultValue={inicial.address_city ?? ""}
            autoComplete="address-level2"
            erro={erros.address_city}
          />
          <Campo
            nome="address_state"
            rotulo="Estado"
            obrigatorio={exige}
            defaultValue={inicial.address_state ?? ""}
            autoComplete="address-level1"
            erro={erros.address_state}
          />
        </div>
      </Secao>

      <Secao
        titulo="Dependentes"
        ajuda="Cônjuge e filhos. Essas informações são usadas nos formulários do governo americano. Se não houver, deixe em branco."
      >
        {linhas.map((linha, i) => (
          <div
            key={linha.chave}
            className="space-y-3 rounded-2xl border p-3"
            role="group"
            aria-label={`Dependente ${i + 1}`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`dep_full_name_${linha.chave}`}>Nome completo</Label>
                <Input
                  id={`dep_full_name_${linha.chave}`}
                  name="dep_full_name"
                  defaultValue={linha.full_name ?? ""}
                  aria-invalid={erros[`dependents.${i}`] ? true : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`dep_relationship_${linha.chave}`}>Relacionamento</Label>
                <NativeSelect
                  id={`dep_relationship_${linha.chave}`}
                  name="dep_relationship"
                  defaultValue={linha.relationship ?? ""}
                >
                  <option value="">Selecione</option>
                  {Object.entries(RELACIONAMENTOS).map(([codigo, texto]) => (
                    <option key={codigo} value={codigo}>
                      {texto}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`dep_birth_date_${linha.chave}`}>Data de nascimento</Label>
                <Input
                  id={`dep_birth_date_${linha.chave}`}
                  name="dep_birth_date"
                  type="date"
                  defaultValue={linha.birth_date ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`dep_birth_country_${linha.chave}`}>País de nascimento</Label>
                <Input
                  id={`dep_birth_country_${linha.chave}`}
                  name="dep_birth_country"
                  defaultValue={linha.birth_country ?? ""}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <FieldError mensagem={erros[`dependents.${i}`]} pequeno />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                onClick={() => setLinhas((atual) => atual.filter((l) => l.chave !== linha.chave))}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Remover
              </Button>
            </div>
          </div>
        ))}

        <FieldError mensagem={erros.dependents} pequeno />

        {linhas.length < MAXIMO_DE_DEPENDENTES ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setLinhas((atual) => [...atual, { chave: novoId() }])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Adicionar dependente
          </Button>
        ) : null}
      </Secao>

      {declaracao ? (
        <div className="space-y-1.5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="aceite"
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              aria-invalid={erros.aceite ? true : undefined}
            />
            <span>{declaracao}</span>
          </label>
          <FieldError mensagem={erros.aceite} pequeno />
        </div>
      ) : null}

      <div className="space-y-3">
        {/* Durante um envio, o aviso na tela é o da resposta anterior — vencido. */}
        {aviso && !alterado && !enviando ? (
          // A chave remonta o aviso a cada resposta: nada do aviso anterior
          // (o "Não" já clicado) sobra para os parecidos novos (M3).
          <Fragment key={controleDoAviso.numero}>{aviso(estado, { reenviarCom })}</Fragment>
        ) : null}
        <FieldError mensagem={estado.error} />
        <div className="flex flex-wrap justify-end gap-2">
          {rodape}
          <Button type="submit" disabled={enviando}>
            {enviando ? rotuloEnviando : rotuloDoEnvio}
          </Button>
        </div>
      </div>
    </form>
  );
}
