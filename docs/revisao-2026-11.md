# Revisão de código — novembro de 2026

Revisão do app inteiro contra a spec (`docs/spec.md`), no commit `ecf7256`,
pelo processo de revisão do superpowers, em três frentes lidas em paralelo:
**banco e segurança**, **offline e dinheiro**, **telas e fluxos**.

Cada achado grave ou importante foi **conferido** antes de entrar aqui: no
código, no banco (policies e permissões lidas direto do Supabase) ou rodando.
A coluna "Conferido" diz como.

**Graus:** **GRAVE** perde dado, expõe dado de cliente ou quebra algo marcado
como pronto · **Importante** falha num caso real que vai acontecer · **Médio**
defeito real, efeito pequeno ou raro · **Sugestão** melhoria; nada quebra sem
ela. **Esforço:** P pequeno (horas) · M médio (um dia) · G grande (vários dias).

---

## O que está bem

- **A porta sem login (ficha de cadastro) está estreita**: token de 256 bits,
  lista fechada de campos, uso único, linha travada, teste que tenta injetar
  campos proibidos e falha.
- **Chaves compostas** impedem, no próprio banco, um registro de uma
  organização apontar para outra.
- **"Falha não vira vazio"** é cumprido em quase todas as telas: erro antes do
  404, Início que nunca diz "tudo em dia" quando não conseguiu ler.
- **Dinheiro**: parcelas fecham no centavo, real e dólar nunca se somam,
  conversão só com cotação, fuso de São Paulo certo.
- **Offline**: o desenho (cópia do servidor separada da fila do que falta
  subir) é sólido; o service worker nunca serve página velha do cache.
- **Quadro do CRM**: arrastar não pula a confirmação do Ganho nem o motivo do
  Perdido; o seletor continua para o celular.

---

## GRAVE

| # | O que é | Onde | O que se veria | Esf. | Conferido |
|---|---|---|---|---|---|
| G1 | **Qualquer pessoa da equipe da Duli pode se promover a dona**, entrar na organização de um parceiro e apagar contatos de vez. A regra do banco confere se a pessoa é da Duli, não o papel dela | `0003` — policies de `organization_members`, `organizations`, `people_delete`; `current_user_is_root()` | Um `staff` (inclusive a conta de teste, cuja senha está no CI) vira `owner`, lê CPF e documentos de clientes de parceiro, apaga contatos com processos e cobranças | M | Sim — policies lidas no banco |
| G2 | **Um membro pode mudar a organização de um contato** e plantá-lo na carteira de outra organização, ou tomar um contato de um parceiro | `0003` — `people_update_staff`; nenhum gatilho congela `organization_id` | Contato "aparece" na carteira de outra empresa, e tudo o que ela registrar sobre ele fica legível para quem o plantou. Hoje sem parceiro real, mas fura o isolamento que a spec dá como garantido | M | Sim — policy e gatilhos lidos no banco |
| G3 | **Cotação com 3 casas vira milhar**: "5,425" é lido como 5.425, e um pagamento de US$ 1.000 entra como R$ 5.425.000 no "Recebido no mês". A sugestão da próxima baixa já vem errada | `lib/numbers.ts:44`, `financeiro/schema.ts:74`, `cobrancas.tsx:101` | Fechamento do mês errado por um fator de mil, sem aviso | P | Sim — rodei: `parseMoney("5,425") = 5425` |
| G4 | **Todo diálogo fecha quando o servidor recusa**, levando o erro e o que foi digitado junto. O mesmo nos formulários de criar (nota, etapa, pasta, tag, motivo de recusa de arquivo) | `lib/use-dialog-on-success.ts:24`, `lib/action-state.ts:43`, `form-dialog.tsx` | Clica Salvar, o diálogo some, nada foi gravado, nenhum aviso. Ex.: dar baixa em dólar sem cotação, novo contato com e-mail inválido | M | Sim — a recusa carrega a mesma marca do sucesso, e o diálogo fecha com qualquer marca |
| G5 | **"Adicionar" na coluna Ganho cria cliente direto**, sem confirmação e sem histórico; na coluna Perdido, sem motivo | `crm/quadro.tsx:272`, `opportunity-dialog.tsx`, `opportunities/actions.ts:70` | Um clique na coluna errada transforma um lead em cliente para sempre | P | Sim — código lido |
| G6 | **Internet ruim vira "o servidor recusou"** e trava a fila do aparelho: cada gravação pendente fica marcada como recusada e não sobe mais sozinha | `lib/local/fila.ts:159`, `transporte-da-fila.ts` | Em Wi-Fi sem saída ou 4G fraco, a Sincronização mostra tudo como recusado e oferece "Descartar" trabalho que o servidor nunca recusou | P | Sim — a fila só reconhece queda de rede como exceção, e o cliente do Supabase devolve a queda como resposta |
| G7 | **Dois cliques rápidos para reordenar perdem o segundo** em silêncio | `lib/local/fila.ts:117,270` | A linha "pula de volta" para a ordem anterior | P | Sim — o item é apagado pelo id, que é o mesmo da versão nova |
| G8 | **O modo sem internet para cerca de 1 hora depois do último uso online**: o login guardado expira e o app pede para entrar de novo, sem rede para entrar | `lib/local/usuario.ts:48` | Em voo ou visita a cliente: "Abrindo…" por 25 s e depois "Sua sessão terminou neste aparelho"; nada grava | M | Reproduzido pelo revisor; código lido |

## Importante

| # | O que é | Onde | O que se veria | Esf. | Conferido |
|---|---|---|---|---|---|
| I1 | A **suíte de testes está vermelha**: um teste usa data fixa de setembro | `secoes-do-aparelho.test.tsx:57` | O próximo push falha no CI | P | Sim — rodei, falha |
| I2 | Mover negócio **não é tudo-ou-nada**: se o registro no histórico ou a promoção a cliente falhar, a etapa já mudou e a tela mostra o contrário | `opportunities/mover.ts` | Negócio ganho com a pessoa ainda lead; tentar de novo duplica o histórico | M | Sim — código lido |
| I3 | O quadro **reabre negócio ganho sem perguntar** (arrastar ou trocar o seletor da coluna Ganho) | `crm/quadro.tsx:83` | Um toque no celular reabre o negócio; some o "Ver processo" | P | Sim |
| I4 | **Aviso de "ficha recebida" fica preso** na Início se alguém gerar um link novo antes de conferir | `dados-cadastrais.tsx:140`, `cadastro/queries.ts`, `painel/queries.ts` | O aviso nunca some: o botão "Conferi" desaparece do contato | P | Sim |
| I5 | **Processo encerrado continua gerando alerta** de etapa e pasta vencidas | `painel/regras.ts`, `painel/queries.ts` (não lê o status) | Alertas eternos na Início para casos aprovados ou negados | P | Sim |
| I6 | **Hora da atividade grava 3 horas antes** em produção (o servidor está em UTC) | `people/timeline-actions.ts:70` | Ligação lançada às 14:30 aparece 11:30 | P | Sim |
| I7 | **Editar contato diz que salvou** mesmo quando o banco não gravou | `people/actions.ts:55` | Alteração perdida com mensagem de sucesso | P | Sim |
| I8 | **Excluir contato é um clique**, sem confirmação; e o contato excluído continua com negócios no quadro, processos e cobranças nos alertas, e a ficha abre sem dizer que está na lixeira | `contatos/page.tsx:166`, `opportunities/queries.ts`, `contatos/[id]/page.tsx` | Contato some sem aviso, mas o caso dele continua aparecendo pelo app | M | Sim — sem confirmação; o resto pelo código |
| I9 | **Excluir pasta apaga os arquivos antes** de apagar a pasta; se a segunda parte falhar, os arquivos (passaportes, comprovantes) já foram | `projects/documentos-actions.ts:243` | Pasta de pé apontando para arquivos que não existem mais | P | Sim |
| I10 | O **cliente do portal consegue gravar** em produtos do negócio (tabela que o app não usa) | `0004` — policy de `opportunity_products` | Hoje sem efeito na tela; brecha aberta para quando o portal existir | P | Sim — policy lida no banco |
| I11 | O **texto do aceite (LGPD)** é escrito por quem chama a função, e a equipe pode reescrever a resposta e a prova depois | `0035` — `enviar_ficha_de_cadastro`, policy `registration_forms_all` | A prova do consentimento não prova nada | P | Sim — policy lida no banco |
| I12 | **Função nova no banco nasce executável por qualquer um**; hoje está tudo protegido porque cada função foi fechada à mão | `0003:68` | A primeira função esquecida vira uma segunda porta sem login | P | Sim — funções do schema `private` estão executáveis por `anon` |
| I13 | **CPF, RG e endereço de todos os contatos vão para o disco** de cada aparelho (a cópia offline pega a linha inteira); quem é da Duli baixa também as associações de todas as organizações | `lib/local/transporte-supabase.ts:28`, `banco.ts` | Dado pessoal em todo notebook e celular, sem precisar | P | Sim — `select("*")` |
| I14 | **Conta de teste com acesso à Duli real**, e as suítes de teste gravam e apagam no banco com os 76 contatos | `0015`, `tests/rls`, `tests/fumaca` | Uma limpeza que falhe deixa lixo na carteira; somado a G1, a conta de teste vira dona | M/G | Sim |
| I15 | **Testes de segurança que podem passar sem provar** o que dizem (pegam "a organização da Duli" sem filtrar pelo usuário) | `configuracao.test.ts:41`, `financeiro.test.ts:126`, outros | Falsa segurança: o teste passa por outro motivo | P | Sim — quem é da Duli enxerga todas as associações |
| I16 | **Redirecionamento aberto** depois do login (`/login?next=//site-falso`) | `auth/actions.ts:42` | Golpe: a pessoa entra de verdade e cai numa página falsa pedindo a senha | P | Sim |
| I17 | **Várias abas abertas sobem a mesma fila ao mesmo tempo** | `lib/local/sincronizador.ts:28` | Gravação mais antiga pode chegar por último e valer | M | Revisor; a conferir na correção |
| I18 | A **cópia offline trunca em 1.000 linhas** sem avisar | `transporte-supabase.ts`, `espelho.ts` | Lista parcial mostrada como lista inteira (hoje abaixo do limite; parcelas chegam lá) | M | Revisor; a conferir na correção |
| I19 | O **Financeiro não recusa mostrar dados com mais de 14 dias** sem sincronizar (a Configuração recusa) | `financeiro/lista.tsx`, `cobrancas.tsx` | Vencidas e recebidos de um mês atrás como se fossem de hoje | P | Sim — a checagem só existe na Configuração |
| I20 | **Cobrança com várias partes não é tudo-ou-nada**; entrada negativa gera parcela negativa | `financeiro/escritas-locais.ts:121`, `financeiro/schema.ts:46` | Cobrança sem parcelas no servidor, e "Descartar" diz que voltou ao normal | M | Reproduzido pelo revisor |
| I21 | **Exclusão recusada some da tela** sem marca; o motivo só aparece na Sincronização | `lib/local/sobreposicao.ts:93` | Cobrança some da lista e dos totais, mas continua no servidor | P | Sim |
| I22 | A **compactação das Observações pode apagar texto** em edição simultânea | `pages/sincronia.ts`, `0025` | Texto perdido para quem abrir depois (raro) | M | Revisor; não reproduzido |
| I23 | **Mudar a versão da cópia offline não recarrega nada** | `lib/local/banco.ts:20` | Coluna nova nunca chega aos aparelhos | P | Reproduzido pelo revisor |
| I24 | **Cobrança carimbada com a organização de quem clicou**, não do cliente | `financeiro/escritas-locais.ts:127` | Cobrar cliente de parceiro dá erro enganoso | P | Sim — apontado pelas duas frentes |
| I25 | **Sem internet, só abrem as telas visitadas** desde a última atualização do app; e a cópia guardada da tela leva nome e e-mail de quem usou | `lib/sw/estrategia.ts`, `sw/sw.ts`, `(app)/layout.tsx` | Depois de "Atualizar", Financeiro não abre offline até ser visitado com rede; num aparelho compartilhado, o nome do anterior aparece por um instante | M | Revisor |
| I26 | **Financeiro diz "Nenhuma cobrança ainda"** quando na verdade ainda não baixou ou a sincronia falhou | `cobrancas.tsx:300`, `lista.tsx:107` | Parece que o cliente não deve nada | P | Revisor |
| I27 | A **fumaça não pega erro de leitura** na maioria das telas (só confere que abriu) | `tests/fumaca/rotas.test.ts` | Tela quebrada passa no teste | P | Sim |

## Médio

| # | O que é | Onde | Esf. |
|---|---|---|---|
| M1 | Lista de contatos corta em 200 sem avisar; filtro de tag roda depois do corte; contagens da Início herdam o teto | `people/queries.ts:54` | P |
| M2 | Filtro de tag sem resultado diz "Nenhum contato ainda. Crie o primeiro" | `contatos/page.tsx:68` | P |
| M3 | Busca não trata `%` e `_` | `people/queries.ts:66` | P |
| M4 | Editar contato sem DDI grava "+55" sozinho | `person-dialog.tsx:61` | P |
| M5 | Na tela de um negócio perdido, um clique na trilha reabre sem perguntar | `crm/[id]/trilha.tsx:72` | P |
| M6 | O motivo de "Resolver" bloqueado só aparece passando o mouse — no celular não se vê | `documentos.tsx:316` | P |
| M7 | "Excluir de vez" aceita clique duplo e o segundo dá aviso de erro | `visualizador.tsx:251` | P |
| M8 | O registro "Ficha de cadastro" do histórico pode ser apagado à mão (só o movimento do funil é protegido) | `timeline-actions.ts:131` | P |
| M9 | CPF com dígito inválido passa se alguém chamar a função da ficha direto | `0035` | P |
| M10 | Nada no banco impede link da ficha com prazo maior que 15 dias ou token fraco | `0035` | P |
| M11 | Os scripts de semente ligam papéis pelo e-mail do perfil, que a própria pessoa pode trocar | `0002`, `0015` | P |
| M12 | Qualquer membro pode dar acesso de portal a um contato | `people.user_id` | P |
| M13 | `/proposta` e `/agendar` estão liberadas sem login, e não existem — uma tela criada com esse nome nasce aberta | `proxy.ts:52` | P |
| M14 | Qualquer membro pode substituir as Observações de um processo, ou trocar o arquivo de um documento já aprovado mantendo a aprovação | `0024`/`0025`, `0020` | P |
| M15 | Um `admin` pode se promover a `owner` ou remover o `owner` | `organization_members` | P (junto com G1) |
| M16 | "Gerar novo link" cancela o anterior e depois cria o novo; se a segunda parte falhar, o lead fica sem link | `cadastro/actions.ts:84` | P |
| M17 | "Cliente não volta a ser lead" só é garantido pela tela | banco | P |
| M18 | Excluir cobrança, inclusive com parcelas pagas, é permitido a qualquer membro | `0033` | P |
| M19 | Depois que uma gravação sobe, a linha "volta atrás" por um instante até a cópia atualizar | `sincronizador.ts:68` | P |
| M20 | Pedido de sincronia durante outra sincronia é descartado; a gravação espera até 1 minuto | `sincronizador.ts:85` | P |
| M21 | Confirmação de exclusão ignora erro de rede e pode contar como feita | `transporte-da-fila.ts:50` | P |
| M22 | Tags do contato na cópia offline podem ficar velhas para sempre (a recarga prometida não existe) | `espelho.ts` | P |
| M23 | Observações: o aviso "N alterações ainda não subiram" pode aparecer sem motivo ao sair | `pages/sincronia.ts:176` | P |
| M24 | "Tentar de novo" num item antigo pode gravar um valor velho por cima de um novo | `bandeja.tsx:31` | P |
| M25 | Cobrança criada offline mostra cotação como "NaN" até subir | `financeiro/consultas-locais.ts:63` | P |
| M26 | Dar baixa aceita data futura, data impossível e parcela já paga; mensagem de erro errada no campo | `financeiro/schema.ts:15` | P |
| M27 | Sair sem internet apaga os dados do aparelho e não desloga | `sair.tsx:40` | P |
| M28 | Quem nunca clica "Atualizar" acumula versões antigas do app no cache | `sw/sw.ts` | P |

## Sugestão

| # | O que é | Onde |
|---|---|---|
| S1 | "Dashboard" em inglês no menu e no título | `app-sidebar.tsx:34`, `page.tsx:16` |
| S2 | Dicas erradas nos cartões da Início ("Viraram cliente ao fechar um processo") | `(app)/page.tsx:59` |
| S3 | Funil sem etapas mostra quadro vazio sem explicação | `crm` |
| S4 | No celular, o menu das Configurações fica abaixo do conteúdo | `configuracoes/layout.tsx:52` |
| S5 | "Cancelar link" da ficha sem confirmação | `controles-da-ficha.tsx` |
| S6 | Criar vem depois da lista em Etapas e Documentos (regra do projeto diz antes) | `etapas.tsx:296`, `documentos.tsx:262` |
| S7 | Texto "Crie a primeira abaixo" com o formulário acima | `tags-editor.tsx:150` |
| S8 | Cores e cantos fora do padrão (`text-white` em 8 lugares, `rounded-lg`, uma cor fixa) | vários |
| S9 | Borda tracejada usada como enfeite nas tags | `person-tags.tsx:63` |
| S10 | Caixa de tag sem foco visível no teclado | `person-tags.tsx:55` |
| S11 | Rótulos do histórico duplicados em dois arquivos | `timeline.tsx`, `timeline-queries.ts` |
| S12 | `organizations` sem lápide e fora da conferência da cópia offline | banco |
| S13 | Conferir no painel do Supabase: cadastro público desligado ("Allow new users to sign up") | fora do código |

---

## Decisões que são do Renato (lacunas da spec)

| # | Pergunta | Por que importa |
|---|---|---|
| D1 | Contato na lixeira: o que acontece com os negócios, processos, cobranças e alertas dele? | I8 |
| D2 | Negócio ganho pode ser reaberto? Por qual caminho, e por quem? | I3, M5 |
| D3 | Gerar link novo com uma ficha recebida ainda não conferida: substitui, ou a ficha antiga continua valendo? | I4 |
| D4 | Quem pode marcar Ganho: qualquer pessoa da equipe, ou só `owner`/`admin`? | §5 diz "Renato"; o código deixa qualquer um |
| D5 | No portal (Fase 6), o cliente vê as notas internas e o histórico do negócio? Hoje o banco deixaria | Decidir antes de abrir o portal |
| D6 | Outra pessoa entra no mesmo aparelho com alterações da anterior ainda por subir: apagar (hoje, em silêncio), segurar, ou avisar? | Hoje some sem aviso |
| D7 | Criar um banco separado só para os testes (custo: um projeto Supabase a mais, gratuito ou pago) | I14 |

## Deixado de lado pelos revisores, e decidido

| Item | Decisão |
|---|---|
| Cópia offline em texto claro no aparelho | Aceito — já decidido e documentado; I13 reduz o que vai |
| Contatos, CRM, Processos e arquivos offline | Fora — marcados ⬜ na spec |
| Integrações, boleto, nota fiscal | Fora — ⬜ na spec |
| Limite de tentativas na ficha pública | Aceito — token de 256 bits torna adivinhar inviável |
| Relógio do aparelho adiantado para estender os 7/14 dias | Aceito — fora do modelo de ameaça |
| Desempenho acima do volume atual | Aceito; M1 e I18 cobrem os cortes silenciosos |
| `revalidatePath` com caminho fixo | Aceito — no Next 16 a ação já atualiza a tela atual |

## Ordem proposta de correção

| Lote | O quê | Por quê primeiro |
|---|---|---|
| 0 | I1 | A suíte vermelha trava qualquer outro commit |
| 1 — Banco e segurança | G1, G2, M15, I10, I11, I12, I15, I16, I13 | Isolamento entre organizações é a base de tudo; uma migration, com testes vermelhos antes |
| 2 — Dinheiro | G3, I20, I24, M26 | Número errado no fechamento do mês |
| 3 — Telas que perdem o que foi digitado | G4, G5, I2, I3, I6, I7, I9 | Recusa e perda silenciosa no uso diário |
| 4 — Sem internet | G6, G7, G8, I17, I19, I21, I23, I26 | Perda silenciosa de gravação offline |
| 5 — Alertas e fluxos | I4, I5, I8, I27 | Depois das decisões D1–D3 |
| 6 — Médios escolhidos | — | O Renato escolhe |
| — | I14, I18, I22, I25 | Maiores; cada um com plano próprio |
