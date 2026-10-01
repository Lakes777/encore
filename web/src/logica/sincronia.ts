import { NOME_ORIGINAL, type Faixa } from './tipos.ts'

/** Distância (em segundos) que uma faixa pode se afastar do relógio mestre antes de ser corrigida. */
export const TOLERANCIA_SINCRONIA = 0.08

/**
 * Relógio mestre: a primeira faixa que não é a original. A original fica de fora
 * porque normalmente está muda (só toca no botão "tocar a original").
 * Se só houver a original, ela mesma serve.
 */
export function indiceDoMestre(faixas: readonly Pick<Faixa, 'nome'>[]) {
  const indice = faixas.findIndex((faixa) => faixa.nome !== NOME_ORIGINAL)
  return indice === -1 ? 0 : indice
}

/**
 * Quais faixas precisam ser puxadas de volta para o tempo do mestre: as que estão
 * mais longe dele que a tolerância (para frente ou para trás). Devolve os índices.
 * O próprio mestre está a distância zero, então nunca entra.
 */
export function faixasParaCorrigir(tempoMestre: number, tempos: readonly number[], tolerancia = TOLERANCIA_SINCRONIA) {
  const corrigir: number[] = []
  tempos.forEach((tempo, indice) => {
    if (Math.abs(tempo - tempoMestre) > tolerancia) corrigir.push(indice)
  })
  return corrigir
}
