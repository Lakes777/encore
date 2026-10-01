import type { Verso } from './tipos.ts'

/** A letra tem tempo em algum verso? (Sem tempo, a tela mostra o texto inteiro parado.) */
export function letraSincronizada(versos: readonly Verso[]) {
  return versos.some((verso) => verso.tempo != null)
}

/**
 * Índice do verso que está sendo cantado: o último com tempo <= tempo atual.
 * -1 antes do primeiro verso (ou se nenhum tem tempo). Versos com o mesmo tempo:
 * fica o último deles, que é o que aparece por último no arquivo da letra.
 * Versos sem tempo (null) nunca ficam atuais.
 */
export function indiceDoVersoAtual(versos: readonly Verso[], tempo: number) {
  let atual = -1
  versos.forEach((verso, indice) => {
    if (verso.tempo != null && verso.tempo <= tempo) atual = indice
  })
  return atual
}
