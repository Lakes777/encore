/**
 * A última aba aberta na tela da música (Volumes, Treino, Ajustes) fica no
 * localStorage do navegador, uma só para todas as músicas: quem estava treinando
 * volta para o Treino ao abrir outra música ou recarregar a página.
 */
export type AbaDaMusica = 'volumes' | 'treino' | 'ajustes'

export const ABAS_DA_MUSICA: readonly AbaDaMusica[] = ['volumes', 'treino', 'ajustes']

export const CHAVE_ABA_DA_MUSICA = 'encore:aba-da-musica'

function ehAbaDaMusica(valor: unknown): valor is AbaDaMusica {
  return typeof valor === 'string' && (ABAS_DA_MUSICA as readonly string[]).includes(valor)
}

/** A aba salva, ou null se não há, é inválida ou o navegador não deixa ler (aba anônima, bloqueio). */
export function lerAbaDaMusica(): AbaDaMusica | null {
  try {
    const valor = localStorage.getItem(CHAVE_ABA_DA_MUSICA)
    return ehAbaDaMusica(valor) ? valor : null
  } catch {
    return null
  }
}

/** Guarda a aba escolhida; se o navegador não deixar, só não lembra da próxima vez. */
export function salvarAbaDaMusica(aba: string) {
  if (!ehAbaDaMusica(aba)) return
  try {
    localStorage.setItem(CHAVE_ABA_DA_MUSICA, aba)
  } catch {
    // Sem armazenamento: segue sem lembrar
  }
}
