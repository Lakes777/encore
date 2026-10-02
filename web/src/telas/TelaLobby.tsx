import { ArrowRight, AudioWaveform, Captions, Code, Gauge, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FAIXAS, medirRepeticoes } from '../logica/pranchas.ts'
import { LINK_DA_ABA } from '../logica/rota.ts'
import './TelaLobby.css'

/** Endereço do código do projeto no GitHub. */
export const LINK_GITHUB = 'https://github.com/Lakes777/karaoke-web'

interface Props {
  /** Quantas músicas já estão prontas (null enquanto carrega ou se falhou): decide para onde o "Começar" leva. */
  prontas: number | null
}

const DESTAQUES: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: AudioWaveform, titulo: 'Voz separada com IA', texto: 'Tira a voz de qualquer música do YouTube.' },
  { icone: Captions, titulo: 'Letra sincronizada', texto: 'Cada palavra acende na hora certa de cantar.' },
  { icone: Gauge, titulo: 'Modo treino', texto: 'Velocidade, metrônomo e volume de cada faixa.' },
]

/**
 * Aba Início, onde o site abre: o que o projeto faz e o botão para começar.
 * No fundo, três faixas de pranchas desenhadas passam devagar (só aqui, no lobby).
 */
export function TelaLobby({ prontas }: Props) {
  const [repeticoes, setRepeticoes] = useState(medirRepeticoes)
  useEffect(() => {
    const aoRedimensionar = () => setRepeticoes(medirRepeticoes())
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  // Com a aba do navegador escondida, as faixas param (não gastam CPU à toa)
  const [escondida, setEscondida] = useState(() => document.hidden)
  useEffect(() => {
    const aoMudar = () => setEscondida(document.hidden)
    document.addEventListener('visibilitychange', aoMudar)
    return () => document.removeEventListener('visibilitychange', aoMudar)
  }, [])

  // Sem nenhuma música, começa pela busca; sem servidor, por Minhas músicas (o erro aparece no topo)
  const destino = prontas === 0 ? LINK_DA_ABA.buscar : LINK_DA_ABA.musicas

  return (
    <div className={`lobby ${escondida ? 'lobby--pausado' : ''}`}>
      <div className="lobby__fundo" aria-hidden>
        {FAIXAS.map((pranchas, indice) => {
          const metade = Array.from({ length: repeticoes }, () => pranchas).flat()
          return (
            <div key={indice} className={`lobby__faixa lobby__faixa--${indice + 1}`}>
              <div className="lobby__trilho">
                {/* Duas metades iguais: o trilho anda metade e recomeça sem emenda */}
                {[...metade, ...metade].map((nome, posicao) => (
                  <img key={posicao} className="lobby__prancha" src={`/pranchas/${nome}.svg`} alt="" draggable={false} />
                ))}
              </div>
            </div>
          )
        })}
        <div className="lobby__grade" />
        <div className="lobby__vinheta" />
        <div className="lobby__grao" />
      </div>

      <div className="lobby__conteudo">
        <h1 className="lobby__titulo">Karaokê</h1>
        <p className="lobby__frase">
          Busque uma música no YouTube, tire a voz com IA e cante por cima, com a letra acendendo no ritmo.
        </p>

        <ul className="lobby__destaques">
          {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="lobby__destaque spot">
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
      </div>
    </div>
  )
}
