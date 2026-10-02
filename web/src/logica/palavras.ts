import type { TrechoDeVoz } from './letra.ts'

/**
 * Palavra que acende. O LRCLIB quase nunca tem o tempo de cada palavra (o campo
 * hasWordSync existe, mas veio vazio em todas as músicas testadas), então o tempo
 * é estimado: dentro do verso, só conta o tempo em que a voz principal soa (trechos
 * medidos pelo backend), dividido entre as palavras pelo número de sílabas.
 */

export interface Palavra {
  texto: string
  inicio: number
  fim: number
}

/** Segundos por sílaba quando não há trechos de voz (versão pronta) ou nenhum cai no verso. */
const SEGUNDOS_POR_SILABA = 0.28
/** Trecho de voz menor que isso dentro do verso é ruído (um "s" que vazou, uma respiração). */
const TRECHO_MINIMO = 0.05

/** Sílabas aproximadas: grupos de vogais (serve para português e inglês). */
export function silabas(palavra: string) {
  const grupos = palavra.toLowerCase().match(/[aeiouyáéíóúâêôãõàü]+/g)
  return Math.max(1, grupos?.length ?? 0)
}

/**
 * Início e fim de cada palavra do verso, que vai de `inicio` a `fim` (o começo do
 * verso seguinte; null no último). A pontuação fica grudada na palavra.
 */
export function tempoDasPalavras(
  texto: string,
  inicio: number,
  fim: number | null,
  trechos: readonly TrechoDeVoz[],
): Palavra[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return []
  const pesos = palavras.map(silabas)
  const totalDePesos = pesos.reduce((soma, peso) => soma + peso, 0)
  const estimado = totalDePesos * SEGUNDOS_POR_SILABA
  const limite = fim ?? inicio + estimado

  let comVoz = trechos
    .map(([a, b]) => [Math.max(a, inicio), Math.min(b, limite)] as const)
    .filter(([a, b]) => b - a >= TRECHO_MINIMO)
  // Sem voz medida no verso: canta do começo, no ritmo médio, sem passar do próximo verso
  if (comVoz.length === 0) comVoz = [[inicio, Math.min(limite, inicio + estimado)]]

  const duracaoComVoz = comVoz.reduce((soma, [a, b]) => soma + (b - a), 0)
  // Posição p (segundos de voz desde o começo do verso) -> tempo da música
  const paraTempo = (p: number) => {
    let resto = p
    for (const [a, b] of comVoz) {
      if (resto <= b - a) return a + resto
      resto -= b - a
    }
    return comVoz[comVoz.length - 1][1]
  }

  let acumulado = 0
  return palavras.map((palavra, indice) => {
    const parte = (pesos[indice] / totalDePesos) * duracaoComVoz
    // O início usa o lado "depois" de um buraco (a palavra começa quando a voz volta)
    const comeco = paraTempo(acumulado + 1e-9)
    acumulado += parte
    return { texto: palavra, inicio: comeco, fim: paraTempo(acumulado) }
  })
}

/** Quanto da palavra já foi cantado no tempo atual: de 0 a 1. */
export function preenchimento(palavra: Palavra, tempo: number) {
  if (tempo <= palavra.inicio) return 0
  if (tempo >= palavra.fim) return 1
  return (tempo - palavra.inicio) / (palavra.fim - palavra.inicio)
}
