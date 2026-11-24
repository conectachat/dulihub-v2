# Baixa em dólar sem cotação — desenho curto (24/nov)

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

## Decisões nossas (o Renato pode corrigir)

- **Vale para toda parcela em dólar**, não só para cliente de parceiro: quem
  paga em dólar na Nomad está no mesmo caso.
- **O campo começa vazio.** Hoje ele vem preenchido com a última cotação usada.
  Com a cotação opcional, o valor sugerido seria gravado sem ninguém confirmar.
  A última cotação fica só como exemplo dentro do campo.
- Rótulo "Cotação do dólar (opcional)". Texto de ajuda: "Deixe em branco se o
  dinheiro ficou em dólar. Com a cotação, a parcela entra no recebido em
  reais."
- **Pôr a cotação depois** é desfazer a baixa e dar de novo, com a cotação —
  o caminho que já existe.

## Fora

- Registrar as conversões da Nomad (B).
- Mudar a cotação de uma parcela já paga sem desfazer a baixa.

## Critério de aceite

1. Parcela em US$: dar baixa só com a data grava a parcela paga, com cotação
   nula.
2. Com cotação digitada, grava a cotação; "0" e "150" são recusados com as
   frases de hoje.
3. O campo da cotação abre vazio.
4. No Financeiro, a parcela paga sem cotação conta no total em US$ e aparece
   em "em dólar sem cotação, fora da soma".
