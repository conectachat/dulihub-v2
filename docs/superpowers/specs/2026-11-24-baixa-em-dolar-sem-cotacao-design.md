# Baixa em dólar sem cotação e vencimento renegociado — desenho curto (24/nov)

## Por que

A Thais paga em dólar, e o dinheiro entra e fica em dólar na conta da Nomad.
O Renato converte depois, quando precisa, juntando vários pagamentos — nunca
um só. Na baixa, o app exige "a cotação do dólar no dia", que não existe: não
houve conversão naquele dia. Inventar uma cotação faria o "recebido em reais"
mentir.

## Abordagens

| | O que é | Troca |
|---|---|---|
| **A — cotação opcional na baixa** (escolhida pelo Renato, 24/nov) | Em dólar, a baixa grava só a data; a cotação vira opcional, para quando se souber | Pequena. O pago fica em US$; o "recebido em reais" mostra essas parcelas à parte |
| B — registrar as conversões da Nomad | Além da A, lançar "converti US$ X no dia Y a Z" | O valor real em reais, mas é funcionalidade nova. Fica para quando ele precisar |

## O que muda

- **Baixa de parcela em dólar** (aba Financeiro do perfil, `cobrancas.tsx`):
  a cotação deixa de ser obrigatória. Em branco, a parcela fica paga em US$,
  sem cotação.
- Digitada, valem as regras de hoje: maior que zero e menor que 100 ("Cotação
  fora do normal — confira (ex.: 5,42)").
- Em real, nada muda.
- **O banco já aceita** parcela paga sem cotação (`paid_rate` nulo, 0033): a
  trava estava só na tela (`features/financeiro/schema.ts`). Nenhuma migration.
- **As somas já tratam o caso:** o total por moeda conta o pago em US$; o
  "recebido no mês em reais" deixa a parcela fora da soma e diz "N em dólar
  sem cotação, fora da soma" (`recebidoNoMes`). A regra de dinheiro continua:
  dólar só vira real com cotação e data.

## Decisões (Renato, 24/nov)

- **Vale para toda parcela em dólar**, não só para cliente de parceiro: o
  pagamento em dólar, ou em cripto atrelada ao dólar (USDT, USDC), entra numa
  conta em dólar (Nomad, C6 Global, Binance) e é convertido depois. **Onde
  caiu não se registra.**
- **O campo da cotação abre sempre vazio**, independentemente da cotação usada
  antes, e nunca é obrigatório. Sem a última cotação nem como exemplo: só o
  "Ex.: 5,42" de hoje.
- Rótulo "Cotação do dólar (opcional)" e texto de ajuda: "Deixe em branco se o
  dinheiro ficou em dólar. Com a cotação, a parcela entra no recebido em
  reais." (nossa).
- **Pôr a cotação depois** é desfazer a baixa e dar de novo, com a cotação —
  o caminho que já existe. Se for preciso, vira funcionalidade nova depois.

## Vencimento renegociado (Renato, 24/nov)

O cliente tem parcela daqui a dois dias e combina pagar só na semana que vem.
Como foi acordado, a parcela não pode aparecer como atrasada.

- Na aba Financeiro do perfil, cada parcela **ainda não paga** ganha **"Mudar
  vencimento"**: escolhe a data nova e salva. A lista do Financeiro e os avisos
  da Início passam a usar a data nova (o estado da parcela sai de `due_on`, não
  é guardado — 0033).
- **Fica registrado no histórico do cliente** (Renato): "Vencimento da parcela
  ‹n› de ‹cobrança› mudado de DD/MM/AAAA para DD/MM/AAAA". Uma atividade em
  `activities`, gravada junto da mudança.
- Parcela paga não muda de vencimento: ali a data já não importa (nossa).
- Mesma data de antes não grava nada nem escreve histórico (nossa).
- Funciona sem internet, como a baixa: a mudança e o histórico entram juntos
  na fila do aparelho (nossa: a tela Financeiro é migrada).
- Quem pode: quem pode dar baixa — qualquer membro da organização da
  cobrança; quem decide é a RLS de `installments` e `activities` (nossa).
- Sem migration: o banco já aceita mudar `due_on` (nenhuma trava na coluna).

## Fora

- Registrar as conversões da Nomad (B).
- Mudar a cotação de uma parcela já paga sem desfazer a baixa.
- Mudar o valor da parcela, ou o vencimento de parcela paga.

## Critério de aceite

1. Parcela em US$: dar baixa só com a data grava a parcela paga, com cotação
   nula.
2. Com cotação digitada, grava a cotação; "0" e "150" são recusados com as
   frases de hoje.
3. O campo da cotação abre vazio.
4. No Financeiro, a parcela paga sem cotação conta no total em US$ e aparece
   em "em dólar sem cotação, fora da soma".
5. Parcela não paga, vencendo daqui a 2 dias: "Mudar vencimento" para a
   semana que vem grava a data nova; com a data nova no futuro, ela não fica
   atrasada. O histórico do cliente mostra a mudança com as duas datas.
6. Parcela vencida ontem, mudada para a semana que vem, deixa de aparecer como
   vencida no Financeiro e na Início.
7. Parcela paga não oferece "Mudar vencimento". A mesma data não grava nada.
8. Sem internet, a mudança entra na fila e sobe com o histórico.
