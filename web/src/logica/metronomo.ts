/**
 * Metrônomo: as batidas vêm do backend (librosa, em segundos da música). O clique é
 * agendado no Web Audio um pouco antes da hora (janela), porque um setInterval no
 * navegador atrasa dezenas de ms; o relógio do Web Audio não.
 */

/** Quanto à frente (em segundos de relógio) os cliques são agendados. */
export const JANELA_DO_METRONOMO = 0.15

export interface Agendamento {
  /** Segundos da música entre agora e a batida (para o relógio, dividir pela velocidade). */
  daquiA: number
  indice: number
}

/**
 * Quais batidas agendar agora: as que caem entre `tempo` e `tempo + janela` e ainda
 * não foram agendadas. `proxima` é a primeira não agendada (-1 = não sei: começou,
 * pulou ou pausou). Pulo para trás ou para frente: recomeça da batida seguinte ao tempo.
 */
export function batidasParaAgendar(batidas: readonly number[], tempo: number, janela: number, proxima: number) {
  const perdida =
    proxima < 0 ||
    (proxima > 0 && batidas[proxima - 1] > tempo + janela) || // voltou para antes do que já foi agendado
    (proxima < batidas.length && batidas[proxima] < tempo - 0.05) // pulou para frente
  let indice = perdida ? primeiraDepois(batidas, tempo) : proxima
  const agendar: Agendamento[] = []
  while (indice < batidas.length && batidas[indice] <= tempo + janela) {
    agendar.push({ indice, daquiA: Math.max(0, batidas[indice] - tempo) })
    indice++
  }
  // `pulou`: já havia agendado e o tempo saiu da sequência (os cliques marcados ficaram fora do lugar)
  return { agendar, proxima: indice, pulou: perdida && proxima >= 0 }
}

function primeiraDepois(batidas: readonly number[], tempo: number) {
  const indice = batidas.findIndex((batida) => batida >= tempo)
  return indice === -1 ? batidas.length : indice
}
