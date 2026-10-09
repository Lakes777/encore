import { ArrowRight, Code } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LINK_DA_ABA } from '../logica/rota.ts'
import './TelaLobby.css'

/** Endereço do código do projeto no GitHub. */
export const LINK_GITHUB = 'https://github.com/Lakes777/encore'

interface Props {
  /** Quantas músicas já estão prontas (null enquanto carrega ou se falhou): decide para onde o "Começar" leva. */
  prontas: number | null
}

/** As vantagens, como as faixas do lado A de um disco. */
const FAIXAS = [
  { titulo: 'Voz separada com IA', texto: 'tira a voz de qualquer música do YouTube' },
  { titulo: 'Letra sincronizada', texto: 'cada palavra acende na hora certa de cantar' },
  { titulo: 'Modo treino', texto: 'velocidade, metrônomo e volume de cada faixa' },
]

/**
 * Aba Início, onde o site abre: o que o projeto faz e o botão para começar.
 * Ao lado, um toca-discos: o disco gira devagar com a agulha em cima (só aqui, no lobby;
 * para com "menos animação" e com a aba do navegador escondida).
 */
export function TelaLobby({ prontas }: Props) {
  // Com a aba do navegador escondida, o disco para (não gasta CPU à toa)
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
      <div className="lobby__conteudo">
        <p className="lobby__etiqueta">Lado A · Karaokê com IA</p>
        <h1 className="lobby__titulo">Encore</h1>
        <p className="lobby__frase">
          Busque uma música no YouTube, tire a voz com IA e cante por cima, com a letra acendendo no ritmo.
        </p>

        <ul className="lobby__faixas">
          {FAIXAS.map(({ titulo, texto }, indice) => (
            <li key={titulo} className="lobby__faixa">
              <span className="lobby__numero" aria-hidden>
                {String(indice + 1).padStart(2, '0')}
              </span>
              <span>
                <strong>{titulo}</strong>: {texto}
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

      {/* O toca-discos é enfeite: o leitor de tela não o lê */}
      <div className="lobby__toca" aria-hidden>
        <div className="lobby__disco">
          <span className="lobby__selo">Encore · Lado A</span>
        </div>
        <div className="lobby__furo" />
        <div className="lobby__braco" />
      </div>
    </div>
  )
}
