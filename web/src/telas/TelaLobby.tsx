import { ArrowRight, AudioWaveform, Captions, Code, Gauge, Mic, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../logica/api.ts'
import { LINK_DA_ABA } from '../logica/rota.ts'
import './TelaLobby.css'

/** Endereço do código do projeto no GitHub. */
export const LINK_GITHUB = 'https://github.com/Lakes777/karaoke-web'

/** Pranchas do fundo (desenhos próprios em web/public/pranchas). */
const PRANCHAS = ['onda', 'microfone', 'letra', 'mixer', 'partitura', 'metronomo']

/** Cada faixa começa numa prancha diferente, para as três não ficarem alinhadas. */
const FAIXAS = [0, 2, 4].map((inicio) => [...PRANCHAS.slice(inicio), ...PRANCHAS.slice(0, inicio)])

const DESTAQUES: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: AudioWaveform, titulo: 'Voz separada com IA', texto: 'Tira a voz de qualquer música do YouTube.' },
  { icone: Captions, titulo: 'Letra sincronizada', texto: 'Cada palavra acende na hora certa de cantar.' },
  { icone: Gauge, titulo: 'Modo treino', texto: 'Velocidade, metrônomo e volume de cada faixa.' },
]

/**
 * Página de apresentação, onde o site abre: o que o projeto faz e o botão para começar.
 * No fundo, três faixas de pranchas desenhadas passam devagar (só aqui, no lobby).
 */
export function TelaLobby() {
  // Quantas músicas já estão prontas: decide para onde o "Começar" leva
  const [prontas, setProntas] = useState<number | null>(null)
  useEffect(() => {
    let ativo = true
    api.musicas().then(
      (lista) => ativo && setProntas(lista.length),
      // Sem servidor, o "Começar" leva para Minhas músicas, que mostra o erro
      () => undefined,
    )
    return () => {
      ativo = false
    }
  }, [])

  // Com a aba do navegador escondida, as faixas param (não gastam CPU à toa)
  const [escondida, setEscondida] = useState(() => document.hidden)
  useEffect(() => {
    const aoMudar = () => setEscondida(document.hidden)
    document.addEventListener('visibilitychange', aoMudar)
    return () => document.removeEventListener('visibilitychange', aoMudar)
  }, [])

  const destino = prontas === 0 ? LINK_DA_ABA.buscar : LINK_DA_ABA.musicas

  return (
    <div className={`lobby ${escondida ? 'lobby--pausado' : ''}`}>
      <div className="lobby__fundo" aria-hidden>
        {FAIXAS.map((pranchas, indice) => (
          <div key={indice} className={`lobby__faixa lobby__faixa--${indice + 1}`}>
            <div className="lobby__trilho">
              {/* O conjunto vai duas vezes: o trilho anda metade e recomeça sem emenda */}
              {[...pranchas, ...pranchas].map((nome, posicao) => (
                <img key={posicao} className="lobby__prancha" src={`/pranchas/${nome}.svg`} alt="" draggable={false} />
              ))}
            </div>
          </div>
        ))}
        <div className="lobby__grade" />
        <div className="lobby__vinheta" />
        <div className="lobby__grao" />
      </div>

      <main className="lobby__conteudo">
        <span className="lobby__logo" aria-hidden>
          <Mic size={28} aria-hidden />
        </span>
        <h1 className="lobby__titulo">Karaokê</h1>
        <p className="lobby__frase">
          Busque uma música no YouTube, tire a voz com IA e cante por cima, com a letra acendendo no ritmo.
        </p>

        <ul className="lobby__destaques">
          {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="lobby__destaque">
              <span className="lobby__icone" aria-hidden>
                <Icone size={20} aria-hidden />
              </span>
              <span>
                <strong>{titulo}</strong>
                <span className="texto-fraco">{texto}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="lobby__acoes">
          <a className="botao botao--principal botao--vivo lobby__comecar" href={destino}>
            Começar
            <ArrowRight size={18} aria-hidden />
          </a>
          <a className="lobby__codigo" href={LINK_GITHUB} target="_blank" rel="noreferrer">
            <Code size={16} aria-hidden />
            Ver o código no GitHub
          </a>
        </div>

        {prontas !== null && prontas > 0 && (
          <p className="texto-fraco lobby__numeros">
            {prontas === 1 ? '1 música pronta para cantar' : `${prontas} músicas prontas para cantar`}
          </p>
        )}
      </main>
    </div>
  )
}
