import { useEffect, useState } from 'react'

/**
 * Navegação pelo hash, sem biblioteca:
 *   #/ (ou vazio) -> lobby, a página de apresentação
 *   #/musicas    -> início, aba Minhas músicas
 *   #/buscar     -> início, aba Buscar
 *   #/fila       -> início, aba Fila
 *   #/musica/ID  -> tela da música
 */
export type AbaInicio = 'musicas' | 'buscar' | 'fila'

export type Rota = { tela: 'lobby' } | { tela: 'inicio'; aba: AbaInicio } | { tela: 'musica'; id: string }

/** Página de apresentação (onde o site abre). */
export const LINK_LOBBY = '#/'

export const LINK_DA_ABA: Record<AbaInicio, string> = {
  musicas: '#/musicas',
  buscar: '#/buscar',
  fila: '#/fila',
}

export function lerRota(hash: string): Rota {
  const achado = /^#\/musica\/([0-9a-f]{12})$/.exec(hash)
  if (achado) return { tela: 'musica', id: achado[1] }
  if (hash === LINK_DA_ABA.buscar) return { tela: 'inicio', aba: 'buscar' }
  if (hash === LINK_DA_ABA.fila) return { tela: 'inicio', aba: 'fila' }
  if (hash === LINK_DA_ABA.musicas) return { tela: 'inicio', aba: 'musicas' }
  // Hash vazio, #/ ou qualquer endereço desconhecido: o lobby
  return { tela: 'lobby' }
}

/** Mesma tela (as abas do início contam como uma tela só: trocar de aba não refaz o início). */
export function mesmaTela(a: Rota, b: Rota) {
  if (a.tela === 'musica' && b.tela === 'musica') return a.id === b.id
  return a.tela === b.tela
}

export function linkDaMusica(id: string) {
  return `#/musica/${id}`
}

export const LINK_INICIO = LINK_DA_ABA.musicas

export function useRota() {
  const [rota, setRota] = useState(() => lerRota(window.location.hash))
  useEffect(() => {
    const aoMudar = () => setRota(lerRota(window.location.hash))
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])
  return rota
}
