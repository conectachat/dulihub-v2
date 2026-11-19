/**
 * Abrir ou baixar um arquivo cuja URL assinada só existe depois de uma ida
 * ao servidor — testado em `abrir.test.ts`.
 *
 * O Safari (sobretudo no iPhone) bloqueia `window.open` chamado depois de um
 * `await`, porque já não é o clique de quem pediu. Então a aba abre **no
 * clique**, vazia, e só depois recebe o endereço. Sem endereço, ela fecha.
 */
export async function abrirEmNovaAba(obterUrl: () => Promise<string | null>): Promise<boolean> {
  const janela = window.open("", "_blank");
  const url = await obterUrl();

  if (!url) {
    janela?.close();
    return false;
  }

  if (janela) {
    // O equivalente de `noopener`: a aba nova não alcança esta.
    janela.opener = null;
    janela.location.href = url;
  } else {
    // Bloqueada mesmo assim: abre aqui, que é melhor que nada.
    window.location.assign(url);
  }
  return true;
}

/**
 * Baixar não precisa de aba nova: a URL assinada com `download` responde
 * como anexo, e o navegador baixa sem sair da página.
 */
export async function baixar(obterUrl: () => Promise<string | null>): Promise<boolean> {
  const url = await obterUrl();
  if (!url) return false;
  window.location.assign(url);
  return true;
}
