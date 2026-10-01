import type { Musica } from './tipos.ts'

/** 125 -> "2:05". */
export function formatarDuracao(segundos: number | null | undefined) {
  if (segundos == null || !Number.isFinite(segundos) || segundos < 0) return '--:--'
  const inteiro = Math.floor(segundos)
  return `${Math.floor(inteiro / 60)}:${String(inteiro % 60).padStart(2, '0')}`
}

/** Tempo estimado de espera: 45 -> "~45 s", 1300 -> "~22 min". */
export function formatarEstimativa(segundos: number | null | undefined) {
  if (segundos == null) return 'tempo desconhecido'
  if (segundos < 60) return `~${Math.max(1, Math.round(segundos))} s`
  return `~${Math.round(segundos / 60)} min`
}

/** Texto curto embaixo do nome: "A maior". */
export function descricaoTom(musica: Pick<Musica, 'tom' | 'escala'>) {
  return musica.tom && musica.escala ? `${musica.tom} ${musica.escala}` : 'tom desconhecido'
}
