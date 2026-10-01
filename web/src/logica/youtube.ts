/** Segundos que a prévia toca (o mesmo DURACAO_PREVIA do backend, em karaoke/busca.py). */
export const DURACAO_PREVIA = 15

/** Onde a prévia começa: um terço da música, sem passar do fim. Igual ao backend. */
export function inicioDaPrevia(duracao: number | null | undefined) {
  if (!duracao || duracao <= DURACAO_PREVIA) return 0
  return Math.min(Math.floor(duracao / 3), duracao - DURACAO_PREVIA)
}

/** Endereço do player embutido do YouTube que toca só o trecho da prévia. */
export function urlDaPrevia(idVideo: string, inicio: number) {
  const comeco = Math.max(0, Math.floor(inicio))
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(idVideo)}?start=${comeco}&end=${comeco + DURACAO_PREVIA}&autoplay=1`
}

/** Os canais automáticos do YouTube Music se chamam "Artista - Topic"; fica só o artista. */
export function artistaDoCanal(canal: string) {
  return canal.replace(/\s+-\s+Topic$/, '').trim()
}
