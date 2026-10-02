import { useEffect, useState } from 'react'
import { mesmaTela, useRota } from './logica/rota.ts'
import { TelaInicio } from './telas/TelaInicio.tsx'
import { TelaLobby } from './telas/TelaLobby.tsx'
import { TelaMusica } from './telas/TelaMusica.tsx'

/** Quanto dura o fade de saída da tela antes da próxima entrar (o mesmo .tela--saindo do CSS). */
export const SAIDA_DA_TELA = 150

export default function App() {
  const rota = useRota()
  // Ao trocar de tela, a anterior some num fade rápido e só então a nova entra
  const [exibida, setExibida] = useState(rota)
  const saindo = !mesmaTela(rota, exibida)

  useEffect(() => {
    if (!saindo) return
    const espera = window.setTimeout(() => {
      setExibida(rota)
      window.scrollTo(0, 0)
    }, SAIDA_DA_TELA)
    return () => window.clearTimeout(espera)
  }, [saindo, rota])

  // Trocar de aba no início não troca de tela: a aba vem direto da rota
  const tela = saindo ? exibida : rota
  return (
    // key: trocar de música recria a tela (players, letra e volumes começam do zero)
    <div key={tela.tela === 'musica' ? tela.id : tela.tela} className={saindo ? 'tela tela--saindo' : 'tela tela--entrando'}>
      {tela.tela === 'lobby' && <TelaLobby />}
      {tela.tela === 'inicio' && <TelaInicio aba={tela.aba} />}
      {tela.tela === 'musica' && <TelaMusica id={tela.id} />}
    </div>
  )
}
