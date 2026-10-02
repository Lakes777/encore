import { useEffect, useRef, useState } from 'react'
import { mesmaTela, useRota } from './logica/rota.ts'
import { TelaInicio } from './telas/TelaInicio.tsx'
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

  // Na tela nova, o foco vai para o título dela (o leitor de tela anuncia onde está; sem
  // isto o foco cairia no body). Não ao abrir a página: só quando a tela muda.
  const caixa = useRef<HTMLDivElement>(null)
  const telaComFoco = useRef(exibida)
  useEffect(() => {
    if (telaComFoco.current === exibida) return
    telaComFoco.current = exibida
    const raiz = caixa.current
    if (!raiz) return
    // No início, o título da aba aberta; na música, o h1 (ou a tela toda, enquanto carrega)
    const alvo = raiz.querySelector<HTMLElement>('.aba-tela:not([hidden]) :is(h1, h2)') ?? raiz.querySelector<HTMLElement>('h1, h2') ?? raiz
    alvo.tabIndex = -1
    alvo.focus({ preventScroll: true })
  }, [exibida])

  // Trocar de aba no início não troca de tela: a aba vem direto da rota
  const tela = saindo ? exibida : rota
  return (
    // key: trocar de música recria a tela (players, letra e volumes começam do zero)
    <div ref={caixa} key={tela.tela === 'musica' ? tela.id : 'inicio'} className={saindo ? 'tela tela--saindo' : 'tela tela--entrando'}>
      {tela.tela === 'musica' ? <TelaMusica id={tela.id} /> : <TelaInicio aba={tela.aba} />}
    </div>
  )
}
