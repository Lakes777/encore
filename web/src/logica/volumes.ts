import { NOME_ORIGINAL, type Faixa } from './tipos.ts'

/**
 * O que a tela guarda sobre os volumes. A chave é o arquivo da faixa (único na música).
 * Os valores dos controles não mudam quando se liga "tocar a original": o volume que
 * vai para o <audio> é calculado por volumeEfetivo, e desligar volta como estava.
 */
export interface EstadoVolumes {
  /** De 0 a 1. */
  volumes: Record<string, number>
  mudos: Record<string, boolean>
  tocandoOriginal: boolean
}

export function eOriginal(faixa: Pick<Faixa, 'nome'>) {
  return faixa.nome === NOME_ORIGINAL
}

export function limitarVolume(volume: number) {
  if (!Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}

export function estadoInicialDosVolumes(faixas: readonly Faixa[]): EstadoVolumes {
  const volumes: Record<string, number> = {}
  for (const faixa of faixas) volumes[faixa.arquivo] = limitarVolume(faixa.volume)
  return { volumes, mudos: {}, tocandoOriginal: false }
}

/** O volume que de fato vai para o <audio> da faixa. */
export function volumeEfetivo(faixa: Faixa, estado: EstadoVolumes) {
  const volume = estado.volumes[faixa.arquivo] ?? limitarVolume(faixa.volume)
  if (eOriginal(faixa)) return estado.tocandoOriginal ? 1 : volume
  if (estado.tocandoOriginal || estado.mudos[faixa.arquivo]) return 0
  return volume
}
