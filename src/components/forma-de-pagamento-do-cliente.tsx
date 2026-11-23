import { valorComConversao, type FormaParaOCliente } from "@/lib/forma-do-cliente";
import { formatarDia } from "@/lib/formatar";
import { ROTULO_DO_METODO } from "@/lib/parcelas";
import { formatarMoeda, formatarPorMoeda, somarItensPorMoeda } from "@/lib/totals";

/**
 * A forma de pagamento desenhada para o cliente (entrega 4b, §5.4 do
 * desenho): os serviços, e cada parte com o método, o valor — com o dólar de
 * onde veio, quando houver — e todas as datas, inclusive a do cartão.
 *
 * A prévia do envio (tela do lead) e a ficha pública usam **este** componente:
 * a equipe aprova exatamente o que o cliente vai ler. Nunca mostra a cotação.
 *
 * Uma coluna, sem largura fixa: no celular de 375 px cada parcela é uma linha
 * com a data e o valor.
 */
export function FormaDePagamentoDoCliente({ forma }: { forma: FormaParaOCliente }) {
  const totalDosVistos = formatarPorMoeda(somarItensPorMoeda(forma.vistos));

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h3 className="font-medium">Serviços</h3>
        <ul className="divide-y rounded-2xl border">
          {forma.vistos.map((v, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span>{v.visa_name}</span>
              <span className="whitespace-nowrap tabular-nums">
                {formatarMoeda(v.amount, v.currency)}
              </span>
            </li>
          ))}
        </ul>
        {forma.vistos.length > 1 ? (
          <p className="text-right text-muted-foreground">Total: {totalDosVistos}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Como vai ser pago</h3>
        {forma.partes.map((parte, i) => {
          const valor = valorComConversao(parte.total, parte.currency, parte.usd_equivalent);
          const unica = parte.parcelas.length === 1 ? parte.parcelas[0] : null;

          return (
            <div key={i} className="space-y-1 rounded-2xl border p-3">
              <p className="font-medium">
                {parte.label} · {ROTULO_DO_METODO[parte.method]}
              </p>
              {unica ? (
                <p>
                  {valor} em {formatarDia(unica.due_on)}
                </p>
              ) : (
                <>
                  <p>{valor}</p>
                  <ul className="divide-y">
                    {parte.parcelas.map((p) => (
                      <li
                        key={p.number}
                        className="flex items-baseline justify-between gap-3 py-1.5"
                      >
                        <span className="text-muted-foreground">{formatarDia(p.due_on)}</span>
                        <span className="whitespace-nowrap tabular-nums">
                          {formatarMoeda(p.amount, parte.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
