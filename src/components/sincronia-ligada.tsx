"use client";

import { useEffect } from "react";

import { limparOutrosUsuarios } from "@/lib/local/limpeza";
import { ligarSincronia } from "@/lib/local/sincronizador";
import { useUsuarioLocal } from "@/lib/local/usuario";

/**
 * O motor da sincronia, montado uma vez e sem aparecer.
 *
 * Estava dentro do indicador da barra lateral, e isso tinha três defeitos que
 * só se enxergam juntos: a barra é `md:flex`, então **no celular nada
 * sincronizava** — justamente o aparelho que mais fica sem internet; recolher
 * a barra no computador desligava a sincronia; e pôr o indicador também no
 * menu do celular ligaria dois motores, com dois relógios disputando a mesma
 * marca d'água.
 *
 * Motor separado de mostrador: este componente liga, o indicador só conta o
 * que está acontecendo.
 *
 * Aqui também some o que ficou de outra conta neste aparelho — é o caso que o
 * botão Sair nunca alcança, porque a sessão expirada manda a pessoa para o
 * login sem rodar linha nenhuma do app no navegador dela.
 */
export function SincroniaLigada() {
  const { userId } = useUsuarioLocal();

  useEffect(() => {
    if (!userId) return;
    void limparOutrosUsuarios(userId);
    return ligarSincronia(userId);
  }, [userId]);

  return null;
}
