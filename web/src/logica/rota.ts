import { useEffect, useState } from 'react'

/**
 * Navegação pelo hash, sem biblioteca:
 *   #/           -> início (busca, fila e lista de músicas)
 *   #/musica/ID  -> tela da música
 */
export type Rota = { tela: 'inicio' } | { tela: 'musica'; id: string }

export function lerRota(hash: string): Rota {
  const achado = /^#\/musica\/([0-9a-f]{12})$/.exec(hash)
  return achado ? { tela: 'musica', id: achado[1] } : { tela: 'inicio' }
}

export function linkDaMusica(id: string) {
  return `#/musica/${id}`
}

export const LINK_INICIO = '#/'

export function useRota() {
  const [rota, setRota] = useState(() => lerRota(window.location.hash))
  useEffect(() => {
    const aoMudar = () => setRota(lerRota(window.location.hash))
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])
  return rota
}
