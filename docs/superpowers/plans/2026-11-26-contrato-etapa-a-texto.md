# Contrato, etapa A — o texto do contrato, sem o ZapSign — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`). TDD em todo passo de código.

**Objetivo:** o app monta o contrato padrão com a ficha conferida e a forma confirmada do lead. A equipe vê a prévia, edita aquele contrato, gera de novo e baixa o Word. O modelo fica em Configurações → Contrato, e o texto de cada visto fica no tipo de visto. Os leads de teste existem para as simulações. Nada sai do app.

**Arquitetura:**
- **Lógica pura** em `src/lib/contrato/` (porque Configurações e o lead usam a mesma; uma feature não importa de outra):
  - por extenso;
  - os nós do contrato;
  - montar, gerar de novo e "editado à mão";
  - a cláusula de pagamento;
  - os dados a partir da ficha;
  - "o que falta";
  - os exemplos.
- **Plate em duas pontas** (`src/components/contrato/`):
  - um kit de edição (modelo, texto do visto, versão);
  - um kit estático, para a prévia na tela e para o Word no servidor (`exportToDocx` no Node).
- **Banco.** Uma migration para o contrato (0072) e uma para os leads de teste (0073), cada uma com teste de RLS vermelho antes.
- **Gravação:**
  - a versão do contrato só se grava pelas funções `gerar_contrato` / `editar_contrato` / `regerar_contrato` (`security invoker`, marca `dulihub.via_contrato`), como a forma de pagamento;
  - o modelo, pelo cliente do navegador com RLS;
  - o texto do visto, pela fila do espelho.
- **Telas:**
  - o cartão **Contrato** no lead;
  - a página `/crm/[id]/contrato`, com a prévia, o Editar, o Gerar de novo e o Baixar Word;
  - Configurações → Contrato;
  - o cartão "Texto do contrato" no tipo de visto;
  - "Lead de teste" na Nova oportunidade.

**Tecnologia:** Next.js 16 (App Router, Server Actions, Route Handler), Supabase Postgres com RLS, Plate 53 (`platejs`, `@platejs/docx-io`), Dexie (espelho), zod 4, vitest com jsdom e @testing-library, bun.

**Spec:**
- desenho: `docs/superpowers/specs/2026-11-26-contrato-e-assinatura-design.md`. Requisito desta etapa: as §5.1 a §5.4 (até "Mudou enquanto você olhava"), a §6.1 (só a marca e o "nunca cliente"), as §8 e §9 no que é da etapa A, e a §10 "Etapa A";
- base: a 4a e a 4b (`2026-11-21-entrega-4a-forma-de-pagamento-design.md`, `2026-11-23-entrega-4b-link-da-forma-design.md`);
- requisitos: `docs/spec.md` 7.5 (CTR-1, CTR-2, CTR-5).

## Restrições globais

- `bun`, nunca `npm`. Nunca `--no-verify`. Não ler os valores do `.env.local`.
- **Banco que é produção.** Migration aplicada pelo conector do Supabase (`apply_migration`). O arquivo `supabase/migrations/NNNN_*.sql`, os tipos regenerados (`src/lib/supabase/database.types.ts`) e o `docs/banco.md` vão no **mesmo commit**. Se o conector recusar, parar e avisar o Renato; não aplicar por outro caminho.
- Toda função nova:
  - `set search_path = ''`;
  - `revoke execute … from public, anon`;
  - `grant execute … to authenticated`;
  - as de gatilho, `revoke … from public, anon, authenticated`.
- Gatilho de guarda deixa passar quando `auth.uid()` é nulo (migration/painel), como os da 0036 em diante (`docs/banco.md` §1).
- Tabela nova:
  - `unique (id, organization_id)` e estrangeiras compostas;
  - RLS ligada com policy na mesma migration;
  - gatilhos `private.set_updated_at` e `private.marcar_lapide`;
  - índice `(organization_id, updated_at)`.
- **A versão que a tela viu** é o `updated_at` devolvido **como texto**, e vai de volta como texto. `new Date()` perde os microssegundos (foco 1 da 4b).
- **Datas:**
  - `due_on` e datas de dia, com `formatarDia` (`@/lib/formatar`);
  - o dia de hoje, com `hojeEmSaoPaulo()`;
  - a tela não conta dias úteis: o último dia para assinar vem do banco (`ultimo_dia_para_assinar`).
- **Dinheiro:**
  - `formatarMoeda` (`@/lib/totals`) e `somarItensPorMoeda`;
  - nunca uma moeda somada na outra;
  - a cláusula 3 sai da **cópia confirmada** (`payment_plan_responses.snapshot`, formato `formaParaOClienteSchema` de `@/lib/forma-do-cliente`), nunca da forma em edição.
- Configurações → Contrato só com internet; a exceção entra no `AGENTS.md` (tarefa 10).
- `src/components/ui/` é código do Plate/shadcn: não se edita. Os componentes novos do contrato moram em `src/components/contrato/`.
- **Frases fixas**, cópia exata:

  | Situação | Frase |
  |---|---|
  | Quem não é dono do negócio nem gestão | "Só o dono do negócio ou a gestão mexem no contrato." |
  | Negócio encerrado | "O negócio está encerrado; reabra para mexer no contrato." |
  | Sem ficha recebida | "Falta a ficha de cadastro do cliente." |
  | Ficha recebida sem conferir | "Há uma ficha recebida por conferir. Confira antes de gerar o contrato." |
  | Sem forma confirmada | "Falta a forma de pagamento confirmada." |
  | Visto sem tipo | "O visto ‹nome› não está ligado a um tipo de visto." |
  | Tipo sem texto | "O visto ‹nome› não tem texto do contrato. Configure em Tipos de visto." |
  | Sem modelo, ou modelo vazio | "Configure o modelo do contrato em Configurações → Contrato." |
  | Gerar, ou Gerar de novo, com ficha ou forma diferentes das lidas | "A ficha ou a forma mudaram enquanto você olhava. Atualize a página." |
  | Editar quando ficha ou forma mudaram depois de gerar | "A ficha ou a forma mudaram: use Gerar de novo." |
  | Versão diferente da que a tela viu | "O contrato mudou enquanto você olhava. Atualize a página." |
  | Gerar com rascunho já existente | "Este negócio já tem um contrato em rascunho." |
  | Editar ou gerar de novo fora do rascunho | "Só o contrato em rascunho se edita." |
  | Corpo que não é lista de nós | "O contrato veio num formato inválido." |
  | Corpo acima de 1 MB | "O contrato passou do tamanho máximo." |
  | Mexer em `contract_versions` pela API | "Mude o contrato pela tela do negócio." |
  | Apagar versão fora da cascata | "O contrato não se apaga." |
  | Modelo gravado por outra pessoa entre a leitura e o Salvar | "O modelo mudou enquanto você olhava. Atualize a página." |
  | Configurações → Contrato sem internet | "Configurações → Contrato precisa de internet." |
  | Aviso do Gerar de novo com peça editada | "Gerar de novo substitui o que foi editado à mão em: ‹lista›." |
  | Selo na prévia | "editado à mão" |
  | Linha acima da prévia | "Se for enviado hoje, vale até ‹DD/MM/AAAA›." |
  | Marca de teste fora da criação | "A marca de teste só se define ao criar o contato." |
  | Lead de teste com contato existente | "A marca de teste só vale para contato novo." |
  | Lead de teste por quem não é gestão | "Só a gestão cria lead de teste." |
  | Lead de teste virando cliente | "Lead de teste não vira cliente." |

- **Histórico** (tipo `contrato`, do sistema): "Contrato gerado (versão ‹n›)" e "Contrato gerado de novo (versão ‹n›)".

## Decisões deste plano

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| P1 | Sem a tabela `contracts` do §8: `contract_versions` aponta direto para o negócio, e um índice único parcial garante uma versão não terminal por negócio | Na etapa A ela só guardaria o id do negócio. O §8 diz "proposta, não definitiva" | Uma migration a mais se a B precisar de linha por contrato |
| P2 | As peças são nós do Plate. No modelo: `campo_do_contrato` (inline vazio) e `bloco_do_contrato` (bloco vazio). Na versão: `peca_campo` e `peca_bloco`, editáveis, com o `hash` do que o app gerou. "Editado à mão" é hash diferente | Desenho §12 deixou o formato com quem constrói; o hash dispensa guardar cópia paralela | Nenhum |
| P3 | "Data do contrato" e "válido até" se preenchem na hora de mostrar e de baixar (`noDiaDoEnvio`), com o dia de hoje e o último dia para assinar se enviado hoje. Na B, o envio congela | É o que o §5.4 pede ("a data que valerá se o envio for hoje") sem regravar a versão a cada dia | Nenhum |
| P4 | A estrutura da cláusula 3 está no código (`blocoDePagamento`), e as frases por método estão no modelo. A redação final sai das simulações | §5.3: "o texto exato da cláusula 3 fica para os testes da etapa A" | Ajustes de redação pedem commit |
| P5 | Dos leads de teste (§6.1), a etapa A traz a marca na criação, o selo e o "nunca cliente". Apagar de vez e o ZapSign de testes ficam na B | O Renato faz as simulações agora, com leads de teste. Sem a marca, ele criaria contatos que nunca se apagam (D1). Apagar de vez só importa no fim dos testes | Leads de teste ficam no CRM, com selo, até a B |
| P6 | O bloco de serviços usa o texto de cada **tipo** de visto do negócio uma vez só, na ordem do negócio | Dois itens do mesmo tipo (dois dependentes) repetiriam a cláusula | Nenhum |
| P7 | Campo vazio da ficha vira "—" no contrato | O contrato se gera e a prévia mostra o buraco. Barrar pediria regra de "campo obrigatório para contrato" que ninguém decidiu | Nenhum |
| P8 | O Word é gerado no servidor desde a etapa A (`wordDoContrato`), pela mesma função que a B vai usar | Desenho §7.1: o servidor não confia em arquivo vindo da tela | Nenhum |
| P9 | Configurações → Contrato: a página do servidor passa a organização e o papel; ler e gravar o modelo vai pelo cliente do navegador | Configurações é domínio migrado e não tem `actions.ts` (§8); o servidor é quem sabe a organização atual | Nenhum |
| P10 | O histórico registra gerar e gerar de novo; editar não | Cada Salvar viraria uma linha no histórico | Nenhum |
| P11 | Por extenso: entre o último grupo e os anteriores vai " e " se ele é menor que 100 ou múltiplo de 100, senão ", "; centavos com " e "; "um milhão de reais"; dia 1 como "1º" | É a forma dos contratos assinados ("três mil e novecentos dólares", "trinta e cinco mil, oitocentos…") | Ajuste numa função testada |
| P12 | Pagamento: frase de método uma vez por método, na ordem em que aparece, no fim do bloco; numeração "‹prefixo›.1, ‹prefixo›.2…" pelo `prefixo` do bloco (padrão "3") | Os contratos assinados põem "3.3 Os valores serão pagos via PIX…" no fim | Redação a ajustar (P4) |

## Foco da revisão

1. **Ficha com campo vazio** (sem RG, sem complemento, sem endereço nenhum): o contrato se gera com "—", e o endereço sem vírgula sobrando. Teste em `dados.test.ts` (tarefa 2).
2. **Forma com duas moedas** (dólar à vista por transferência mais reais no cartão convertidos de dólar):
   - o total da 3.1 soma por moeda e junta com " e ";
   - cada parte mostra o próprio valor;
   - nada se soma entre moedas.
   Teste em `pagamento.test.ts` (tarefa 2).
3. **Modelo sem peça nenhuma**, ou só com campos: montar e gerar de novo funcionam, e gerar de novo sem peça devolve o corpo igual. Teste em `montagem.test.ts` (tarefa 2).
4. **Conteúdo colado do Word com nó que o kit não conhece** (imagem, comentário): a prévia e o Word não quebram, e o texto do nó sai como parágrafo. Teste em `word.test.ts` (tarefa 3).
5. **Perto da meia-noite.** Às 22h em São Paulo, o UTC já é o dia seguinte; a "data do contrato" é o dia de São Paulo. Teste em `dados.test.ts` com relógio fixo (tarefa 2).

---

### Tarefa 1: valores e datas por extenso

**Arquivos:**
- Criar: `src/lib/contrato/extenso.ts`
- Teste: `src/lib/contrato/extenso.test.ts`

**Interfaces:**
- Produz:
  - `numeroPorExtenso(n: number): string` — inteiro de 0 a 999.999.999;
  - `valorPorExtenso(valor: number, moeda: "BRL" | "USD"): string`;
  - `dataPorExtenso(dia: string): string` — dia `AAAA-MM-DD`.
- `RangeError` para negativo, `NaN`, não inteiro em `numeroPorExtenso`, e acima do limite.

- [ ] **Passo 1: escrever o teste que falha.** Casos de `valorPorExtenso` (P11), com os valores exatos:

```ts
it.each([
  [6000, "USD", "seis mil dólares"],
  [3900, "USD", "três mil e novecentos dólares"],
  [2100, "USD", "dois mil e cem dólares"],
  [35857.91, "BRL", "trinta e cinco mil, oitocentos e cinquenta e sete reais e noventa e um centavos"],
  [21527.76, "BRL", "vinte e um mil, quinhentos e vinte e sete reais e setenta e seis centavos"],
  [8964.47, "BRL", "oito mil, novecentos e sessenta e quatro reais e quarenta e sete centavos"],
  [1, "BRL", "um real"], [1, "USD", "um dólar"],
  [0.01, "BRL", "um centavo"], [0.5, "BRL", "cinquenta centavos"],
  [100, "BRL", "cem reais"], [101, "BRL", "cento e um reais"],
  [1000, "BRL", "mil reais"], [1001, "BRL", "mil e um reais"],
  [1250, "BRL", "mil, duzentos e cinquenta reais"],
  [16, "BRL", "dezesseis reais"], [17, "BRL", "dezessete reais"], [19, "BRL", "dezenove reais"],
  [1000000, "BRL", "um milhão de reais"],
  [2500000, "USD", "dois milhões e quinhentos mil dólares"],
  [1250000, "BRL", "um milhão, duzentos e cinquenta mil reais"],
])("%s %s → %s", (v, m, esperado) => expect(valorPorExtenso(v, m)).toBe(esperado));
```

  Mais:
  - `dataPorExtenso("2026-11-13")` → `"13 de novembro de 2026"`;
  - `dataPorExtenso("2027-01-01")` → `"1º de janeiro de 2027"`;
  - `valorPorExtenso(-1, "BRL")` e `valorPorExtenso(NaN, "BRL")` lançam `RangeError`;
  - `valorPorExtenso(0.1 + 0.2, "BRL")` → `"trinta centavos"`: os centavos se arredondam como em `emCentavos`, de `@/lib/totals`.

- [ ] **Passo 2:** `bun x vitest run src/lib/contrato/extenso.test.ts` → FALHA (módulo não existe).
- [ ] **Passo 3: implementar** em `extenso.ts`.
  - Trabalhar em centavos inteiros (`emCentavos`).
  - Grupos de milhões, milhares e unidades.
  - Juntar conforme P11.
  - "de" antes da moeda só quando o valor é milhão exato.
- [ ] **Passo 4:** o mesmo comando → PASSA.
- [ ] **Passo 5: commit.**
  ```bash
  git add src/lib/contrato/extenso.ts src/lib/contrato/extenso.test.ts
  git commit -m "feat(contrato): valores e datas por extenso"
  ```

### Tarefa 2: os nós, a montagem, a cláusula de pagamento e os dados da ficha

**Arquivos:**
- Criar: `src/lib/contrato/nos.ts`, `src/lib/contrato/pagamento.ts`, `src/lib/contrato/montagem.ts`, `src/lib/contrato/dados.ts`
- Teste: `src/lib/contrato/pagamento.test.ts`, `src/lib/contrato/montagem.test.ts`, `src/lib/contrato/dados.test.ts`

**Interfaces:**
- Consome:
  - `valorPorExtenso` e `dataPorExtenso` (tarefa 1);
  - `FormaParaOCliente` e `valorComConversao` (`@/lib/forma-do-cliente`);
  - `Metodo` e `METODOS` (`@/lib/parcelas`);
  - `formatarMoeda` e `somarItensPorMoeda` (`@/lib/totals`);
  - `formatarDia` e `telefoneCompleto` (`@/lib/formatar`).
- Produz em `nos.ts`:
  ```ts
  export const CAMPOS_DO_CONTRATO = ["nome","cpf","rg","orgao_expedidor","email","telefone","endereco",
    "estado_civil","nacionalidade","profissao","data_do_contrato","valido_ate",
    "assinante_nome","assinante_cargo"] as const;
  export type CampoDoContrato = (typeof CAMPOS_DO_CONTRATO)[number];
  export const ROTULO_DO_CAMPO: Record<CampoDoContrato, string>; // "Nome","CPF","RG","Órgão expedidor","E-mail","Telefone","Endereço","Estado civil","Nacionalidade","Profissão","Data do contrato","Válido até","Assinante da Duli","Cargo do assinante"
  export const BLOCOS_DO_CONTRATO = ["servicos", "pagamento"] as const;
  export type BlocoDoContrato = (typeof BLOCOS_DO_CONTRATO)[number];
  export const ROTULO_DO_BLOCO: Record<BlocoDoContrato, string>; // "Serviços", "Pagamento"
  export const TIPO = { campo: "campo_do_contrato", bloco: "bloco_do_contrato",
    pecaCampo: "peca_campo", pecaBloco: "peca_bloco" } as const;
  export type NoDoContrato = { type?: string; text?: string; children?: NoDoContrato[]; [k: string]: unknown };
  export type CorpoDoContrato = NoDoContrato[];
  export function hashDaPeca(no: NoDoContrato): string; // FNV-1a 32 bits, hex, sobre JSON dos children; o conteúdo de `peca_campo` aninhado conta como vazio
  ```
  - Formas dos nós: `{type:"campo_do_contrato", campo, children:[{text:""}]}`, `{type:"bloco_do_contrato", bloco, prefixo?: string, children:[{text:""}]}`, `{type:"peca_campo", campo, hash, children:[{text}]}`, `{type:"peca_bloco", bloco, prefixo?, hash, children: blocos}`.
- Produz em `pagamento.ts`: `blocoDePagamento(forma: FormaParaOCliente, frases: Partial<Record<Metodo, string>>, prefixo: string, validoAte: string): CorpoDoContrato` (só parágrafos e uma lista; o "válido até" vai como `peca_campo` dentro do primeiro parágrafo).
- Produz em `montagem.ts`:
  ```ts
  export type DadosDoContrato = {
    campos: Record<CampoDoContrato, string>;
    servicos: CorpoDoContrato[]; // o texto de cada tipo, na ordem (P6)
    forma: FormaParaOCliente;
    frases: Partial<Record<Metodo, string>>;
  };
  export function montarContrato(modelo: CorpoDoContrato, dados: DadosDoContrato): CorpoDoContrato;
  export function regerarPecas(corpo: CorpoDoContrato, dados: DadosDoContrato): CorpoDoContrato;
  export function pecasEditadas(corpo: CorpoDoContrato): string[]; // rótulos, sem repetir, na ordem do texto
  export function noDiaDoEnvio(corpo: CorpoDoContrato, dia: { dataDoContrato: string; validoAte: string }): CorpoDoContrato;
  ```
- Produz em `dados.ts`:
  ```ts
  export type PessoaDoContrato = Pick<Tables<"people">, "full_name"|"tax_id"|"national_id"|"national_id_issuer"
    |"email"|"phone_country_code"|"phone"|"address_street"|"address_number"|"address_complement"
    |"address_district"|"address_city"|"address_state"|"address_postal_code"|"marital_status"
    |"nationality"|"job_title">;
  export type Assinante = { nome: string; cargo: string };
  export function enderecoDoContrato(p: PessoaDoContrato): string;
  export function camposDoContrato(p: PessoaDoContrato, assinante: Assinante,
    dia: { hoje: string; validoAte: string }): Record<CampoDoContrato, string>;
  ```
  - `hoje` e `validoAte` chegam como `AAAA-MM-DD`;
  - `data_do_contrato` sai por extenso e `valido_ate` em `DD/MM/AAAA`.

- [ ] **Passo 1: testes que falham, em `pagamento.test.ts`.** Exemplo 1: um visto de US$ 6.000, uma parte Pix em BRL de 35.857,91 com `usd_equivalent` de 6.000 e 4 parcelas; `prefixo` "3"; `validoAte` "16/11/2026".
  - O texto do 1º parágrafo é `"3.1 Pela prestação dos serviços avençados, o Contratante pagará à Contratada a importância de US$ 6.000,00 (seis mil dólares), válido até o dia 16/11/2026."`. O "16/11/2026" está num `peca_campo` `valido_ate`.
  - O 2º parágrafo começa com `"3.2 Pagamento: US$ 6.000,00 (seis mil dólares) convertidos para R$ 35.857,91 (trinta e cinco mil, oitocentos e cinquenta e sete reais e noventa e um centavos), em 4 parcelas:"`.
  - Segue uma lista com `"16/11/2026 – R$ 8.964,47"` e as outras três.
  - O último parágrafo é `"3.3 " + frases.pix`.
  - Parte de uma parcela termina com `", com vencimento em DD/MM/AAAA."`.
  - **Foco 2:**
    - vistos US$ 2.100 + US$ 3.900 → a 3.1 diz "US$ 6.000,00 (seis mil dólares)";
    - com um visto em reais a mais, o total junta com " e ";
    - as partes de transferência e cartão aparecem cada uma com o seu valor, e as frases de transferência e cartão, uma vez cada, na ordem em que aparecem.
  - Frase de método vazia ou ausente: nenhum parágrafo para ela.
- [ ] **Passo 2: testes que falham, em `montagem.test.ts`.**
  - `montarContrato` troca `campo_do_contrato` `nome` por `peca_campo` com o texto do nome e `hash` de 8 caracteres hexadecimais.
  - `bloco_do_contrato` `servicos` vira `peca_bloco` com os filhos de `servicos[0]` seguidos dos de `servicos[1]`.
  - `bloco_do_contrato` `pagamento` com `prefixo: "3"` vira `peca_bloco` com `blocoDePagamento(…, "3", …)`.
  - O resto do modelo fica igual.
  - O modelo não é alterado (imutável).
  - `pecasEditadas(montarContrato(…))` é `[]`.
  - Trocar o texto de um `peca_campo` `cpf` dá `["CPF"]`. Trocar um parágrafo do `peca_bloco` `pagamento` dá `["Pagamento"]`.
  - Trocar só o `valido_ate` aninhado no pagamento dá `["Válido até"]`, e **não** "Pagamento".
  - `regerarPecas`:
    - troca o conteúdo das peças pelos dados novos e mantém, com o mesmo texto, um parágrafo livre editado entre elas;
    - mantém o `prefixo`;
    - depois dele, `pecasEditadas` é `[]`.
  - **Foco 3:** modelo sem nó de peça → `montarContrato` devolve um corpo igual ao modelo e `regerarPecas` devolve o corpo igual.
  - `noDiaDoEnvio`:
    - troca `data_do_contrato` e `valido_ate` não editados, e o hash continua batendo;
    - um `valido_ate` editado à mão fica como estava.
- [ ] **Passo 3: testes que falham, em `dados.test.ts`.**
  - `enderecoDoContrato` com tudo preenchido → `"Rua Exemplo 10, apto 5, Centro, Navegantes, SC, 88372-500"`.
  - **Foco 1:**
    - sem complemento → `"Rua Exemplo 10, Centro, Navegantes, SC, 88372-500"`;
    - sem nada → `"—"`;
    - sem RG, `rg` é `"—"`.
  - Telefone por `telefoneCompleto`.
  - `assinante_nome` e `assinante_cargo` vêm do assinante.
  - `data_do_contrato` de `"2026-11-13"` → `"13 de novembro de 2026"`; `valido_ate` de `"2026-11-18"` → `"18/11/2026"`.
  - **Foco 5:**
    - com `vi.setSystemTime(new Date("2026-11-14T01:30:00Z"))` (22h30 do dia 13 em São Paulo), `hojeEmSaoPaulo()` dá `"2026-11-13"`;
    - `camposDoContrato(…, { hoje: hojeEmSaoPaulo(), … }).data_do_contrato` é `"13 de novembro de 2026"`.
- [ ] **Passo 4:** `bun x vitest run src/lib/contrato` → FALHA (módulos não existem).
- [ ] **Passo 5: implementar** `nos.ts`, `pagamento.ts`, `montagem.ts` e `dados.ts`, pelas interfaces acima.
  - Percorrer a árvore com uma função recursiva que devolve cópia.
  - `pecasEditadas` compara `hashDaPeca(no)` com `no.hash`.
- [ ] **Passo 6:** `bun x vitest run src/lib/contrato` → PASSA.
- [ ] **Passo 7: commit.** `feat(contrato): montagem do contrato com peças calculadas e cláusula de pagamento`.

### Tarefa 3: o Plate do contrato — kit de edição, kit estático, prévia e Word no servidor

**Arquivos:**
- Criar:
  - `src/components/contrato/contrato-base-kit.tsx` (Slate + estáticos);
  - `src/components/contrato/contrato-kit.tsx` (Plate de edição);
  - `src/components/contrato/transformacoes.ts`;
  - `src/components/contrato/previa-do-contrato.tsx`;
  - `src/components/contrato/editor-do-contrato.tsx`;
  - `src/lib/contrato/word.ts`.
- Teste:
  - `src/lib/contrato/word.test.ts` (`// @vitest-environment node`);
  - `src/components/contrato/previa-do-contrato.test.tsx`;
  - `src/components/contrato/transformacoes.test.ts`.

**Interfaces:**
- Consome:
  - `TIPO`, `ROTULO_DO_CAMPO`, `ROTULO_DO_BLOCO`, `hashDaPeca`, `CorpoDoContrato` (tarefa 2);
  - `DocxExportKit` (`@/components/editor/plugins/docx-export-kit`);
  - `EditorStatic` (`@/components/ui/editor-static`);
  - os kits base de `src/components/editor/plugins/` (`BaseBasicBlocksKit`, `BaseBasicMarksKit`, `BaseListKit`, `BaseAlignKit`, `BaseTableKit`).
- Produz:
  - `ContratoBaseKit: SlatePlugin[]`: blocos básicos, marcas, lista, alinhamento, tabela e os quatro nós do contrato, com componente estático.
    - `peca_*` desenha só os filhos;
    - `campo_*` e `bloco_*` desenham um chip "‹rótulo›".
  - `wordDoContrato(corpo: CorpoDoContrato): Promise<Buffer>`: `import "server-only"`, `exportToDocx(corpo, { editorPlugins: [...ContratoBaseKit, ...DocxExportKit] })` e o Blob vira Buffer.
  - `PreviaDoContrato({ corpo, marcarEditados }: { corpo: CorpoDoContrato; marcarEditados?: boolean })`: cliente, `createSlateEditor` + `EditorStatic`. Com `marcarEditados`, a peça cujo hash não bate ganha o selo "editado à mão".
  - `EditorDoContrato({ valorInicial, aoMudar, modo }: { valorInicial: CorpoDoContrato; aoMudar: (v: CorpoDoContrato) => void; modo: "modelo" | "texto" | "versao" })`:
    - barra com negrito, itálico, sublinhado, títulos, listas e alinhamento;
    - no modo `modelo`, também "Inserir campo" (menu com `ROTULO_DO_CAMPO`), "Inserir bloco" (Serviços / Pagamento) e "Importar do Word" (o `importDocx` que `src/components/ui/import-toolbar-button.tsx` já usa, substituindo o conteúdo depois de confirmar);
    - o bloco de pagamento mostra um campo "Cláusula nº" que grava `prefixo` (padrão "3").
  - `inserirCampo(editor, campo: CampoDoContrato): void` e `inserirBloco(editor, bloco: BlocoDoContrato): void` em `transformacoes.ts`.

- [ ] **Passo 1: teste que falha, em `word.test.ts`.** Ele prova que o `exportToDocx` roda no Node, que é o ponto aberto do §12 do desenho.
  - `wordDoContrato` sobre um corpo com:
    - um título;
    - um parágrafo com negrito;
    - uma lista;
    - uma tabela 2×2;
    - um `peca_campo` `nome` = "Maria Exemplo";
    - um `peca_bloco` com um parágrafo.
  - Devolve `Buffer` começando por `"PK"`. Aberto com `JSZip`, o `word/document.xml` contém "Maria Exemplo", o texto do título e o do parágrafo do bloco.
  - **Foco 4:** um nó `{ type: "img", url: "x", children: [{ text: "legenda" }] }` e um `{ type: "desconhecido", children: [{ text: "solto" }] }` não lançam erro, e "solto" está no XML.
- [ ] **Passo 2:** `bun x vitest run src/lib/contrato/word.test.ts` → FALHA (módulo não existe).
- [ ] **Passo 3: implementar** `ContratoBaseKit` e `wordDoContrato`.
  - Nó de tipo desconhecido: o kit desenha como parágrafo.
  - Se o `exportToDocx` exigir DOM no Node, **parar e reportar**, com o erro, antes de trocar de biblioteca. A alternativa, `docx` gerado a partir do mesmo conteúdo, é dependência nova.
- [ ] **Passo 4:** o mesmo comando → PASSA.
- [ ] **Passo 5: testes que falham, em `previa-do-contrato.test.tsx` e `transformacoes.test.ts`.**
  - A prévia de `montarContrato(…)` mostra o nome e o texto do pagamento, sem o selo "editado à mão".
  - Com um `peca_campo` alterado e `marcarEditados`, aparece exatamente um "editado à mão".
  - `inserirCampo(editor, "cpf")`, num editor `createSlateEditor({ plugins: ContratoBaseKit, value })` com o cursor num parágrafo, deixa um nó `campo_do_contrato` `cpf` inline no parágrafo.
  - `inserirBloco(editor, "pagamento")` deixa um `bloco_do_contrato` com `prefixo: "3"`.
- [ ] **Passo 6:** `bun x vitest run src/components/contrato` → FALHA.
- [ ] **Passo 7: implementar** `contrato-kit.tsx`, `transformacoes.ts`, `previa-do-contrato.tsx` e `editor-do-contrato.tsx`.
  - `peca_*` é editável. O `peca_campo` é inline e não vazio, desenhado com fundo `bg-accent` para a equipe ver o que é calculado.
  - `campo_*` e `bloco_*` são vazios (void): chip `rounded-full` com o rótulo.
  - O editor carrega só no navegador (`next/dynamic`, `ssr: false`), como `observacoes-editor.tsx`.
- [ ] **Passo 8:** `bun x vitest run src/components/contrato src/lib/contrato` → PASSA. Depois, `bun run typecheck` e `bun run lint` em zero.
- [ ] **Passo 9: commit.** `feat(contrato): editor, prévia e Word do contrato`.

### Tarefa 4: banco do contrato (migration 0072)

**Arquivos:**
- Criar: `supabase/migrations/0072_contrato_texto.sql`
- Teste: `tests/rls/contrato.test.ts`
- Modificar: `src/lib/supabase/database.types.ts` (gerado), `docs/banco.md`, `src/features/people/montagem.ts` (`TIPOS_DO_SISTEMA` ganha `"contrato"`), `src/components/perfil/timeline.tsx` (ícone `FileSignature`, rótulo "Contrato")

**Interfaces:**
- Produz (banco):
  - `contract_templates`:
    - colunas: `id`, `organization_id` (único), `body jsonb not null default '[]'`, `signer_name text`, `signer_title text`, `signer_email text`, `method_phrases jsonb not null default '{}'`, `created_at`, `updated_at`;
    - RLS: `select` para membros (`current_user_organizations`); `insert` e `update` só com `current_user_manages(organization_id)`; sem `delete`.
  - `visa_types.contract_text jsonb` nulo, com `check (contract_text is null or jsonb_typeof(contract_text) = 'array')`.
  - `contract_versions`:
    - colunas: `id`, `organization_id`, `opportunity_id`, `number int`, `status text check (status in ('rascunho','enviando','enviada','assinada','recusada','cancelada'))`, `body jsonb not null`, `plan_response_id uuid not null`, `person_updated_at timestamptz not null`, `created_by`, `updated_by`, `created_at`, `updated_at`;
    - FKs compostas para `opportunities` (`on delete cascade`) e `payment_plan_responses`;
    - `unique (opportunity_id, number)`;
    - índice único parcial `contract_versions_uma_aberta on (opportunity_id) where status in ('rascunho','enviando','enviada')`;
    - RLS como `payment_plans` (membros leem, inserem e atualizam);
    - gatilho `private.contract_versions_so_pelas_funcoes`, que exige `dulihub.via_contrato`, com a frase "Mude o contrato pela tela do negócio.";
    - gatilho de `delete`, que só passa na cascata (`pg_trigger_depth() >= 2`), com a frase "O contrato não se apaga.".
  - `private.erro_do_contrato(p_negocio uuid, p_resposta uuid, p_pessoa_versao timestamptz) returns text`. Confere, nesta ordem, devolvendo a primeira frase:
    1. dono ou gestão;
    2. negócio aberto;
    3. ficha (a mais recente com `submitted_at`, por `created_at` como `fichaRecebida`: não existe → "Falta a ficha…"; sem `reviewed_at` → "Há uma ficha recebida por conferir…");
    4. forma `confirmada`;
    5. a resposta mais recente (`answered_at desc, created_at desc`) com `decision in ('confirmada','confirmada_pela_equipe')` é `p_resposta` e a pessoa tem `updated_at = p_pessoa_versao` → senão "A ficha ou a forma mudaram enquanto você olhava. Atualize a página.".
  - `public.gerar_contrato(p_negocio uuid, p_corpo jsonb, p_resposta uuid, p_pessoa_versao timestamptz) returns uuid`:
    - trava o negócio (`for share`);
    - confere o corpo (array, até 1 MB) e o `erro_do_contrato`;
    - recusa se já há rascunho;
    - insere a versão `rascunho` com `number = max+1` e grava o histórico "Contrato gerado (versão ‹n›)".
  - `public.editar_contrato(p_versao uuid, p_versao_lida timestamptz, p_corpo jsonb) returns text`:
    - trava a versão (`for update`);
    - confere dono ou gestão, rascunho e `updated_at = p_versao_lida`;
    - ficha ou forma diferentes das gravadas na versão → "A ficha ou a forma mudaram: use Gerar de novo.";
    - devolve o `updated_at` novo como texto.
  - `public.regerar_contrato(p_versao uuid, p_versao_lida timestamptz, p_corpo jsonb, p_resposta uuid, p_pessoa_versao timestamptz) returns text`:
    - as conferências de `editar_contrato`, menos a de ficha e forma;
    - mais o `erro_do_contrato` com os valores novos;
    - grava o corpo, `plan_response_id` e `person_updated_at`, e o histórico "Contrato gerado de novo (versão ‹n›)".
  - `public.ultimo_dia_para_assinar() returns date`: `stable`, o dia de São Paulo de `private.fim_do_prazo_em_dias_uteis(now(), 3)` menos 1 ms (ver `ultimoDiaDoLink`).
  - Cada função liga `dulihub.via_contrato` com o valor anterior guardado e o devolve no fim (P15 da 4b).
  - Comentário no topo da migration: o porquê de P1, P2 e P10 deste plano.

- [ ] **Passo 1: testes de RLS que falham, em `tests/rls/contrato.test.ts`.**
  - Montagem do lead: o padrão de `tests/rls/forma-enviada.test.ts`, com pessoa e negócio descartáveis da organização de teste. Ficha enviada pelo anônimo de teste (`fichaCompleta`), conferida pela equipe, forma salva e confirmada pela equipe.
  - Casos, com as frases da tabela:
    1. gerar com tudo certo devolve id; a versão é `rascunho`, `number` 1; o histórico tem "Contrato gerado (versão 1)";
    2. gerar de novo pela mesma função → "Este negócio já tem um contrato em rascunho.";
    3. `editar_contrato` com o `updated_at` lido muda o corpo e devolve texto diferente do lido; com o lido antigo → "O contrato mudou enquanto você olhava. Atualize a página." (critério "duas pessoas no mesmo rascunho");
    4. depois de editar o contato (`people.updated_at` muda), `editar_contrato` → "A ficha ou a forma mudaram: use Gerar de novo."; `regerar_contrato` com o `updated_at` novo da pessoa passa e grava "Contrato gerado de novo (versão 1)";
    5. `regerar_contrato` com `p_pessoa_versao` velho → "A ficha ou a forma mudaram enquanto você olhava. Atualize a página.";
    6. forma voltada a rascunho (Refazer) → gerar recusa "Falta a forma de pagamento confirmada.";
    7. sem ficha → "Falta a ficha de cadastro do cliente."; ficha nova enviada e não conferida → "Há uma ficha recebida por conferir. Confira antes de gerar o contrato.";
    8. conta `staff` que não é dona do negócio → "Só o dono do negócio ou a gestão mexem no contrato.";
    9. `insert`/`update` direto em `contract_versions` → "Mude o contrato pela tela do negócio."; `delete` direto apaga 0 linhas;
    10. corpo `{"a":1}` → "O contrato veio num formato inválido.";
    11. pessoa de outra organização não vê a versão (`select` vazio);
    12. `contract_templates`: membro lê; `staff` não grava (0 linhas ou `42501`); gestão grava;
    13. `ultimo_dia_para_assinar()` bate com o oráculo `fimDoPrazo` de `forma-enviada.test.ts` (copiado), menos 1 dia;
    14. apagar o negócio de teste apaga a versão (cascata).
  - Limpeza em `finally`.
- [ ] **Passo 2:** `bun x vitest run tests/rls/contrato.test.ts --no-file-parallelism` → FALHA (funções não existem).
- [ ] **Passo 3: escrever a `0072_contrato_texto.sql` e aplicar pelo conector.**
- [ ] **Passo 4:** regenerar `database.types.ts` pelo conector (`generate_typescript_types`).
- [ ] **Passo 5:** o mesmo comando do passo 2 → PASSA.
- [ ] **Passo 6:** acrescentar `"contrato"` a `TIPOS_DO_SISTEMA`, e o ícone e o rótulo no histórico. O teste em `src/features/people/montagem.test.ts` confere que `contrato` é do sistema.
- [ ] **Passo 7:** atualizar o `docs/banco.md`:
  - "Situação: 0001 a 0072";
  - as três tabelas e a coluna `contract_text`;
  - as funções novas nas tabelas de funções;
  - os gatilhos na lista de gatilhos.
- [ ] **Passo 8:** `bun run verify` → verde.
- [ ] **Passo 9: commit.** Migration, tipos, teste, `banco.md` e o histórico juntos: `feat(contrato): tabelas e funções do contrato (0072)`.

### Tarefa 5: Texto do contrato no tipo de visto

**Arquivos:**
- Modificar:
  - `src/features/settings/escritas-locais.ts` (`salvarTextoDoContrato`);
  - `src/lib/local/banco.ts` (`VERSAO_DO_ESPELHO = 4`);
  - `src/app/(app)/configuracoes/[section]/secoes-locais.tsx` (cartão em `SecaoTipoDeVisto`).
- Criar: `src/app/(app)/configuracoes/[section]/texto-do-contrato.tsx`
- Teste:
  - `src/features/settings/escritas-locais.test.ts`;
  - `src/app/(app)/configuracoes/[section]/texto-do-contrato.test.tsx`.

**Interfaces:**
- Consome:
  - `EditorDoContrato` com `modo: "texto"` e `PreviaDoContrato` (tarefa 3);
  - a coluna `visa_types.contract_text` (tarefa 4).
- Produz:
  - `salvarTextoDoContrato(visaTypeId: string, corpo: CorpoDoContrato | null): Promise<ActionState>`. Corpo sem texto nenhum grava `null`. É um passo `update` em `visa_types` com `patch: { contract_text }`, pelo `gravarLocal` (rótulo "Alterar o texto do contrato do visto ‹nome›").
  - `TextoDoContrato({ visto }: { visto: Tables<"visa_types"> })`:
    - cartão "Texto do contrato" com a prévia, ou `EmptyState` "Sem texto do contrato";
    - botão "Editar texto", que abre um diálogo com o editor e o Salvar.

- [ ] **Passo 1: testes que falham.**
  - `escritas-locais.test.ts`: `salvarTextoDoContrato` enfileira o `update` com o corpo e devolve `ok`; corpo só com parágrafo vazio grava `contract_text: null`.
  - `texto-do-contrato.test.tsx`: sem texto mostra "Sem texto do contrato"; com texto mostra o texto da prévia.
- [ ] **Passo 2:** `bun x vitest run src/features/settings/escritas-locais.test.ts "src/app/(app)/configuracoes/[section]/texto-do-contrato.test.tsx"` → FALHA.
- [ ] **Passo 3: implementar.**
  - `VERSAO_DO_ESPELHO` passa a 4, com comentário: a coluna nova desce nas linhas antigas.
  - Cartão abaixo das etapas em `SecaoTipoDeVisto`.
- [ ] **Passo 4:** o mesmo comando → PASSA. Depois, `bun run verify`.
- [ ] **Passo 5: commit.** `feat(contrato): texto do contrato no tipo de visto`.

### Tarefa 6: Configurações → Contrato

**Arquivos:**
- Criar:
  - `src/features/settings/contrato.ts` (leitura e gravação pelo cliente do navegador);
  - `src/lib/contrato/exemplos.ts`;
  - `src/app/(app)/configuracoes/[section]/secao-do-contrato.tsx` (cliente);
  - `src/app/(app)/configuracoes/[section]/secao-do-contrato-servidor.tsx`.
- Modificar:
  - `src/features/settings/sections.ts` (seção `contrato` no grupo "Empresa": rótulo "Contrato", ícone `FileSignature`, descrição "O modelo do contrato, quem assina pela Duli e as frases de pagamento.");
  - `src/app/(app)/configuracoes/[section]/page.tsx` (ramo `found.slug === "contrato"`).
- Teste:
  - `src/lib/contrato/exemplos.test.ts`;
  - `src/features/settings/contrato.test.ts`;
  - `src/app/(app)/configuracoes/[section]/secao-do-contrato.test.tsx`.

**Interfaces:**
- Consome:
  - `montarContrato`, `camposDoContrato`, `DadosDoContrato` (tarefa 2);
  - `EditorDoContrato` (`modo: "modelo"`) e `PreviaDoContrato` (tarefa 3);
  - `contextoAtual` e `ehDaGestao` (`@/lib/organizacao`);
  - `createClient` (`@/lib/supabase/client`).
- Produz:
  - `type ModeloDoContrato = { corpo: CorpoDoContrato; assinante: { nome: string; cargo: string; email: string }; frases: Partial<Record<Metodo, string>>; versao: string | null }`. `versao` é o `updated_at` lido, como texto; nula quando ainda não existe.
  - `lerModeloDoContrato(supabase, organizationId): Promise<{ modelo: ModeloDoContrato | null; vistos: { name: string; contract_text: CorpoDoContrato | null }[]; error: string | null }>`.
  - `salvarModeloDoContrato(supabase, organizationId, modelo: ModeloDoContrato): Promise<ActionState & { versao?: string }>`:
    - com `versao` nula, faz `insert`; `23505` → "O modelo mudou enquanto você olhava. Atualize a página.";
    - senão, `update … .eq("updated_at", versao).select("updated_at")`; 0 linhas → a mesma frase.
  - `EXEMPLOS: { titulo: string; forma: FormaParaOCliente }[]`, os três do §5.1 sem dado real:
    1. "Só Pix parcelado, de dólar convertido": US$ 6.000 → R$ 35.857,91 em 4 parcelas;
    2. "Dólar à vista por transferência e reais no cartão": US$ 2.100 transferência, 1 parcela; R$ 21.527,76 de US$ 3.900 no cartão, 1 parcela;
    3. "Só reais em boletos": R$ 30.000 em 3 boletos.
  - `PESSOA_DE_EXEMPLO: PessoaDoContrato`: "Maria Exemplo", CPF "000.000.000-00", endereço fictício.
  - `SecaoDoContrato({ organizationId, daGestao })`:
    - sem internet (`navigator.onLine === false` ou falha de rede), a frase "Configurações → Contrato precisa de internet.";
    - o editor do modelo, o assinante (nome, cargo, e-mail) e uma caixa de texto por método (`ROTULO_DO_METODO`);
    - "Salvar";
    - "Ver exemplo", com três abas que desenham `montarContrato(corpo, dados de exemplo)`. Os serviços vêm dos textos dos dois primeiros vistos com texto; sem nenhum, um parágrafo "[Texto do contrato do visto]";
    - quem não é da gestão vê tudo só para leitura, sem Salvar.

- [ ] **Passo 1: testes que falham.**
  - `exemplos.test.ts`: em cada exemplo, a soma das parcelas de cada parte é igual ao total da parte (em centavos), e nenhum texto de `EXEMPLOS` nem de `PESSOA_DE_EXEMPLO` tem e-mail ou telefone real (só "exemplo").
  - `contrato.test.ts`, com o cliente Supabase falso no padrão de `src/features/financeiro/anexos` (se não houver, um objeto com `from().update().eq().eq().select()` que devolve `{ data: [], error: null }`):
    - `update` com 0 linhas → a frase "O modelo mudou…";
    - `insert` com `code: "23505"` → a mesma frase.
  - `secao-do-contrato.test.tsx`:
    - "Ver exemplo" mostra os três títulos e, na aba 1, "seis mil dólares";
    - com `daGestao: false` não há botão "Salvar".
- [ ] **Passo 2:** `bun x vitest run src/lib/contrato/exemplos.test.ts src/features/settings/contrato.test.ts "src/app/(app)/configuracoes/[section]/secao-do-contrato.test.tsx"` → FALHA.
- [ ] **Passo 3: implementar.** `secao-do-contrato-servidor.tsx` é assíncrono: `contextoAtual()` → `<SecaoDoContrato organizationId daGestao />`. `src/features/settings/sections.test.ts` continua passando; ajustar se ele conta as seções.
- [ ] **Passo 4:** o mesmo comando → PASSA. Depois, `bun run verify`. A fumaça cobre a rota nova sozinha, porque as seções vêm de `ALL_SECTIONS`.
- [ ] **Passo 5: commit.** `feat(contrato): Configurações → Contrato com Ver exemplo`.

### Tarefa 7: o cartão Contrato no lead — o que falta, Gerar contrato

**Arquivos:**
- Criar:
  - `src/lib/contrato/falta.ts`;
  - `src/features/contratos/queries.ts`;
  - `src/features/contratos/actions.ts`;
  - `src/app/(app)/crm/[id]/contrato-cartao.tsx`.
- Modificar: `src/app/(app)/crm/[id]/page.tsx` (cartão abaixo de `CartaoDaFormaDePagamento`).
- Teste:
  - `src/lib/contrato/falta.test.ts`;
  - `src/features/contratos/actions.test.ts`;
  - `src/app/(app)/crm/[id]/contrato-cartao.test.tsx`.

**Interfaces:**
- Consome:
  - `montarContrato`, `regerarPecas`, `camposDoContrato` (tarefa 2);
  - as RPCs da tarefa 4;
  - `formaParaOClienteSchema` (`@/lib/forma-do-cliente`);
  - a ficha: `features/contratos` **não** importa de `features/cadastro`. `queries.ts` acha o link mais recente com `submitted_at` (por `created_at`, a mesma regra de `fichaRecebida`), e `falta.ts` recebe só `{ recebida, conferida }`.
- Produz em `falta.ts`:
  ```ts
  export type InsumosDoContrato = {
    negocioAberto: boolean;
    ficha: { recebida: boolean; conferida: boolean };
    formaConfirmada: boolean;
    vistos: { visa_name: string; tipo: { contract_text: CorpoDoContrato | null } | null }[];
    modelo: { corpo: CorpoDoContrato } | null;
  };
  export function oQueFaltaParaOContrato(i: InsumosDoContrato): string | null; // primeira frase, na ordem: encerrado, ficha, por conferir, forma, vistos (na ordem), modelo
  ```
- Produz em `queries.ts`:
  - `type VersaoDoContrato = { id: string; number: number; status: string; body: CorpoDoContrato; updated_at: string; created_at: string }`;
  - `contratoDoNegocio(negocioId: string): Promise<{ versao: VersaoDoContrato | null; error: string | null }>`, com a versão de maior `number`;
  - `insumosDoNegocio(negocioId: string): Promise<{ insumos: InsumosDoContrato | null; dados: DadosDoContrato | null; resposta: string | null; pessoaVersao: string | null; validoAte: string | null; error: string | null }>`. Lê, com a sessão:
    - o negócio;
    - a pessoa (campos de `PessoaDoContrato` e `updated_at` como texto);
    - os links da pessoa;
    - os itens com `visa_types(name, contract_text)`, por `position, created_at`;
    - o modelo;
    - a última resposta da forma;
    - `ultimo_dia_para_assinar`.
    `dados` só quando `oQueFaltaParaOContrato` é nulo.
- Produz em `actions.ts`:
  - `gerarContrato(_prev: ActionState, formData: FormData): Promise<ActionState>`, com `negocio`;
  - `salvarContrato(_prev, formData)`, com `versao`, `versao_lida` e `corpo` (JSON de array; o zod recusa o resto com "O contrato veio num formato inválido.");
  - `gerarDeNovo(_prev, formData)`, com `negocio`, `versao` e `versao_lida`.
  - As três traduzem o erro do banco como as ações da forma em `src/features/opportunities/actions.ts`, chamam `revalidatePath` do lead e de `/crm/[id]/contrato`, e devolvem `gravou()`.
- Produz `ContratoCartao({ negocioId, versao, falta, podeMexer, aberto })`:
  - sem versão, com `podeMexer` e `aberto`:
    - com `falta`, o texto "Para gerar o contrato: ‹falta›";
    - sem `falta`, o botão "Gerar contrato";
  - sem `podeMexer`: "Só o dono do negócio ou a gestão mexem no contrato.";
  - com versão: "Contrato em rascunho — versão ‹n›, gerado em ‹data›", "Abrir contrato" (link para `/crm/[id]/contrato`) e "Baixar Word" (link para `/api/contratos/<versao>/word`).

- [ ] **Passo 1: testes que falham.**
  - `falta.test.ts`: uma frase por condição, na ordem, com os nomes dos vistos; com tudo certo, `null`.
  - `actions.test.ts`, com `createClient` falso no padrão de `src/features/opportunities/actions.test.ts`:
    - `gerarContrato` chama `rpc("gerar_contrato", { p_negocio, p_corpo, p_resposta, p_pessoa_versao })`, com o `p_corpo` de `montarContrato`;
    - com algo faltando, não chama `rpc` e devolve a frase;
    - `salvarContrato` com `corpo` `"{}"` devolve "O contrato veio num formato inválido.";
    - `gerarDeNovo` lê a versão e manda `regerarPecas(body, dados)`.
  - `contrato-cartao.test.tsx`: os três estados acima.
- [ ] **Passo 2:** `bun x vitest run src/lib/contrato/falta.test.ts src/features/contratos "src/app/(app)/crm/[id]/contrato-cartao.test.tsx"` → FALHA.
- [ ] **Passo 3: implementar** e ligar o cartão no `page.tsx`. `podeMexer` é o `podeConfirmar` que já existe; o cartão aparece também com o negócio encerrado, só para leitura.
- [ ] **Passo 4:** o mesmo comando → PASSA. Depois, `bun run verify`.
- [ ] **Passo 5: commit.** `feat(contrato): gerar contrato no lead`.

### Tarefa 8: a página do contrato — prévia, Editar, Gerar de novo, Baixar Word

**Arquivos:**
- Criar:
  - `src/app/(app)/crm/[id]/contrato/page.tsx` (servidor);
  - `src/app/(app)/crm/[id]/contrato/contrato-do-negocio.tsx` (cliente);
  - `src/app/api/contratos/[versao]/word/route.ts`;
  - `src/lib/contrato/arquivo.ts`.
- Teste:
  - `src/app/(app)/crm/[id]/contrato/contrato-do-negocio.test.tsx`;
  - `src/lib/contrato/arquivo.test.ts`.

**Interfaces:**
- Consome:
  - `contratoDoNegocio` e `insumosDoNegocio` (tarefa 7);
  - `salvarContrato` e `gerarDeNovo` (tarefa 7);
  - `noDiaDoEnvio` e `pecasEditadas` (tarefa 2);
  - `PreviaDoContrato`, `EditorDoContrato` e `wordDoContrato` (tarefa 3);
  - `FormDialog` com `aviso` (`@/components/form-dialog`).
- Produz:
  - `nomeDoArquivo(nome: string): string`, que devolve `"Contrato - ‹nome›.docx"` sem `/\:*?"<>|`;
  - `cabecalhoDeDownload(nome: string): string`, com `attachment; filename="…"; filename*=UTF-8''…`.
  - `GET /api/contratos/[versao]/word`:
    - `getUser()`, ou 401;
    - lê a versão e o nome da pessoa pela RLS, ou 404;
    - aplica `noDiaDoEnvio(body, { dataDoContrato: dataPorExtenso(hojeEmSaoPaulo()), validoAte: formatarDia(<ultimo_dia_para_assinar>) })`. Esse é o mesmo formato dos campos: data por extenso e `DD/MM/AAAA`. `insumosDoNegocio` também devolve `validoAte` em `DD/MM/AAAA`;
    - responde com `wordDoContrato`, `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` e o cabeçalho.
  - `ContratoDoNegocio({ negocioId, versao, validoAte, dataDoContrato, podeEditar, editadas })`:
    - a linha "Se for enviado hoje, vale até ‹DD/MM/AAAA›.";
    - a prévia com `marcarEditados`;
    - "Editar": troca a prévia pelo editor (`modo: "versao"`), com "Salvar" (manda `versao_lida`) e "Cancelar";
    - "Gerar de novo": `FormDialog` que, com `editadas.length > 0`, mostra "Gerar de novo substitui o que foi editado à mão em: ‹lista›.";
    - "Baixar Word";
    - sem `podeEditar`, só a prévia e o Word.

- [ ] **Passo 1: testes que falham.**
  - `arquivo.test.ts`: `nomeDoArquivo("Ana/Paula")` → `"Contrato - AnaPaula.docx"`; o cabeçalho com "João" tem o `filename*` em UTF-8 percent-encoded.
  - `contrato-do-negocio.test.tsx`:
    - mostra "Se for enviado hoje, vale até 18/11/2026.";
    - "Editar" mostra "Salvar";
    - com `editadas: ["CPF"]`, abrir "Gerar de novo" mostra "Gerar de novo substitui o que foi editado à mão em: CPF.";
    - sem `podeEditar`, nenhum dos dois botões.
- [ ] **Passo 2:** `bun x vitest run src/lib/contrato/arquivo.test.ts "src/app/(app)/crm/[id]/contrato"` → FALHA.
- [ ] **Passo 3: implementar.**
  - A página aplica `noDiaDoEnvio` antes de passar o corpo à prévia, para mostrar o que o Word vai ter: critério "o Word baixado tem o mesmo texto da prévia".
  - O editor recebe o corpo **gravado**, sem `noDiaDoEnvio`.
  - Sem versão, a página faz `redirect` para o lead.
- [ ] **Passo 4:** o mesmo comando → PASSA. Depois, `bun run verify`.
- [ ] **Passo 5: commit.** `feat(contrato): prévia, edição e Word do contrato`.

### Tarefa 9: leads de teste — marca na criação, selo e nunca cliente (migration 0073)

**Arquivos:**
- Criar: `supabase/migrations/0073_leads_de_teste.sql`
- Teste: `tests/rls/leads-de-teste.test.ts`
- Modificar:
  - `src/lib/supabase/database.types.ts`;
  - `docs/banco.md`;
  - `src/features/opportunities/actions.ts` (`createOpportunity` passa `p_teste`) e `actions.test.ts`;
  - `src/app/(app)/crm/opportunity-dialog.tsx` e `opportunity-dialog.test.tsx` (caixa "Lead de teste");
  - `src/features/opportunities/queries.ts` (`is_test` no `select` da pessoa, no lead e no quadro);
  - `src/app/(app)/crm/[id]/page.tsx` e `src/app/(app)/crm/quadro.tsx` (selo "Teste").

**Interfaces:**
- Produz (banco):
  - `people.is_test boolean not null default false`.
  - Gatilho `private.people_marca_de_teste`, `before insert or update`:
    - no `insert` com `is_test`, exige `dulihub.via_teste = 'on'`;
    - no `update`, `is_test` não muda;
    - a frase é "A marca de teste só se define ao criar o contato.".
  - Gatilho `private.people_teste_nunca_cliente`, `before insert or update`: `new.is_test and new.lifecycle_stage = 'client'` → "Lead de teste não vira cliente.". É um gatilho à parte da `people_trava_do_estagio`, para não reescrever a trava; pega o Ganho, o `marcar_como_cliente`, o `criar_cliente`, o processo e a cobrança, porque todos passam por `lifecycle_stage`.
  - `criar_oportunidade` ganha `p_teste boolean default false`. `drop function` da assinatura antiga e `create` da nova, com os `grant` de antes. Com `p_teste`:
    - contato existente → "A marca de teste só vale para contato novo.";
    - sem `current_user_manages(org da etapa)` → "Só a gestão cria lead de teste.";
    - o nome ganha "TESTE — " na frente, se ainda não começa por "TESTE";
    - `insert` com `is_test = true`, com a marca ligada e devolvida ao valor anterior.
- Produz (tela):
  - na Nova oportunidade, a caixa "Lead de teste — para simulações; nunca vira cliente", só para a gestão e só no modo contato novo;
  - o selo `Badge variant="outline"` "Teste" no cabeçalho do lead e no cartão do quadro.

- [ ] **Passo 1: testes de RLS que falham, em `tests/rls/leads-de-teste.test.ts`.** Na organização de teste, com `teste-parceiro` (owner):
  1. `criar_oportunidade` com `p_teste: true` cria pessoa `is_test` com nome "TESTE — Fulano";
  2. `update people set is_test = false` → "A marca de teste só se define ao criar o contato."; `insert` direto com `is_test: true` → a mesma;
  3. `ganhar_negocio` do lead de teste → "Lead de teste não vira cliente.";
  4. `p_teste` com `p_contato` → "A marca de teste só vale para contato novo.";
  5. `p_teste` pela conta `executora` (staff da `parceiro-teste`) → "Só a gestão cria lead de teste.";
  6. `criar_oportunidade` sem `p_teste` continua criando como antes, cobrindo as chamadas de hoje.
  - Limpeza em `finally`: apagar a pessoa. A organização é de teste, então a 0036 deixa.
- [ ] **Passo 2:** `bun x vitest run tests/rls/leads-de-teste.test.ts --no-file-parallelism` → FALHA.
- [ ] **Passo 3: escrever a 0073 e aplicar pelo conector.** Partir da definição de `criar_oportunidade` em `0054_ganho_so_pela_funcao.sql:660` e mudar só o descrito acima. Depois, regenerar os tipos.
- [ ] **Passo 4:** o mesmo comando → PASSA.
- [ ] **Passo 5: testes de tela que falham.**
  - `actions.test.ts`: com `teste=on` no formulário, a chamada leva `p_teste: true`; sem ele, `false`.
  - `opportunity-dialog.test.tsx`: a caixa só aparece com `daGestao` e no modo contato novo.
- [ ] **Passo 6: implementar a tela.** Os testes passam. Depois, `bun run verify`.
- [ ] **Passo 7:** atualizar o `docs/banco.md`:
  - 0073;
  - `people.is_test`;
  - os dois gatilhos;
  - a assinatura nova de `criar_oportunidade`.
- [ ] **Passo 8: commit.** `feat(contrato): leads de teste para as simulações (0073)`.

### Tarefa 10: documentação, verificação final e revisão

**Arquivos:**
- Modificar:
  - `docs/spec.md`:
    - 7.5: o CTR-1 corrigido (os campos do quadro, §5.1 do desenho) e a etapa A marcada;
    - §6.8: os leads de teste não viram cliente; apagar de vez vem na B;
  - `AGENTS.md`:
    - exceção registrada: Configurações → Contrato só com internet, pelo cliente do navegador;
    - linha nova na tabela "UI: use o que já existe": `EditorDoContrato` / `PreviaDoContrato` / `montarContrato` para texto de contrato;
  - `docs/plano.md`: estado (contrato etapa A pronta; B a seguir);
  - o desenho, §6: a nota de que a marca de teste entrou na A (P5).

- [ ] **Passo 1:** atualizar os quatro documentos. Commit: `docs: contrato etapa A na spec, AGENTS e plano`.
- [ ] **Passo 2:** `bun run verify` → verde. `bun run build` → sem erro.
- [ ] **Passo 3:** com `bun run dev` no ar, `bun run test:fumaca` → verde.
- [ ] **Passo 4: no navegador do app,** com um lead de teste criado pela gestão:
  1. ficha enviada e conferida, forma confirmada;
  2. "Gerar contrato";
  3. a prévia tem o quadro igual à ficha, a 1.1 com o texto do visto e a 3 com os valores por extenso;
  4. editar uma cláusula livre e salvar;
  5. editar o contato, e o Salvar recusa;
  6. "Gerar de novo" mantém a cláusula editada;
  7. "Baixar Word", que abre no Word com o mesmo texto;
  8. Configurações → Contrato → "Ver exemplo" com as três formas;
  9. Ganho do lead de teste recusado com "Lead de teste não vira cliente.".
  - Tirar print de cada etapa.
- [ ] **Passo 5: revisão de código.** superpowers `requesting-code-review` sobre o intervalo de commits desta etapa, com este plano e a §10 "Etapa A" do desenho como requisito. Crítico e Importante corrigidos antes de dar por pronto; achado recusado registrado com o motivo.
- [ ] **Passo 6:** o push é do Renato:
  ```bash
  git -C "D:\Projetos Apps\dulihub-v2" push
  ```
