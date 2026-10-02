/** Segundos que a prévia toca (o mesmo DURACAO_PREVIA do backend, em karaoke/busca.py). */
export const DURACAO_PREVIA = 15

/** Onde a prévia começa: um terço da música, sem passar do fim. Igual ao backend. */
export function inicioDaPrevia(duracao: number | null | undefined) {
  if (!duracao || duracao <= DURACAO_PREVIA) return 0
  return Math.min(Math.floor(duracao / 3), duracao - DURACAO_PREVIA)
}

/** Os canais automáticos do YouTube Music se chamam "Artista - Topic"; fica só o artista. */
export function artistaDoCanal(canal: string) {
  return canal.replace(/\s+-\s+Topic$/, '').trim()
}

/** Miniatura que o YouTube gera para todo vídeo (480x360). */
export function miniaturaDoVideo(idVideo: string | null | undefined) {
  return idVideo ? `https://i.ytimg.com/vi/${idVideo}/hqdefault.jpg` : null
}

/** Capa para a lista: a imagem de fundo escolhida; senão, a miniatura do vídeo; senão, nenhuma. */
export function capaDaMusica(musica: { id_video?: string | null; fundo?: { url: string | null } }) {
  return musica.fundo?.url || miniaturaDoVideo(musica.id_video)
}
