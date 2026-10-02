/** Velocidade da música (1 = normal). Para treinar: mais lenta ou mais rápida, sem mudar o tom. */
export const VELOCIDADE_MINIMA = 0.5
export const VELOCIDADE_MAXIMA = 1.5
export const PASSO_DA_VELOCIDADE = 0.05

/** Prende entre o mínimo e o máximo e arredonda para o passo (evita 0,8500000001). */
export function ajustarVelocidade(valor: number) {
  if (!Number.isFinite(valor)) return 1
  const presa = Math.min(VELOCIDADE_MAXIMA, Math.max(VELOCIDADE_MINIMA, valor))
  const passos = Math.round(1 / PASSO_DA_VELOCIDADE) // 20 passos por 100%
  return Math.round(presa * passos) / passos
}

/** Aplica no <audio>: preservesPitch faz o navegador esticar o som sem mudar o tom. */
export function aplicarVelocidade(audio: HTMLMediaElement, velocidade: number) {
  audio.preservesPitch = true
  audio.defaultPlaybackRate = velocidade // vale também depois de recarregar a faixa
  audio.playbackRate = velocidade
}
