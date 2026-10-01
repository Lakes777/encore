import { ExternalLink, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DURACAO_PREVIA } from '../logica/youtube.ts'

interface Props {
  /** O áudio: a faixa original já baixada, ou o /api/previa do resultado da busca. */
  url: string
  /** Para o link "Abrir no YouTube". */
  idVideo: string
  inicio: number
  titulo: string
  aoFechar: () => void
}

/**
 * Toca os 15 s da prévia num <audio> do próprio site. O player embutido do YouTube
 * recusa muitas músicas de gravadora quando o site é local (127.0.0.1), então o
 * áudio vem do nosso servidor: o arquivo baixado ou o YouTube repassado por ele.
 */
export function Previa({ url, idVideo, inicio, titulo, aoFechar }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronta' | 'erro'>('carregando')

  useEffect(() => {
    const elemento = audio.current
    if (!elemento) return
    const fim = inicio + DURACAO_PREVIA
    const aoCarregar = () => {
      elemento.currentTime = inicio
      elemento.play().catch(() => {
        // navegador bloqueou o play automático: fica o botão de play do controle
      })
    }
    const aoAndar = () => {
      if (elemento.currentTime >= fim) elemento.pause()
    }
    elemento.addEventListener('loadedmetadata', aoCarregar, { once: true })
    elemento.addEventListener('timeupdate', aoAndar)
    return () => {
      elemento.removeEventListener('loadedmetadata', aoCarregar)
      elemento.removeEventListener('timeupdate', aoAndar)
      elemento.pause()
    }
  }, [inicio])

  return (
    <div className="previa">
      <audio
        ref={audio}
        src={url}
        controls
        preload="metadata"
        aria-label={`Prévia de ${titulo}`}
        onCanPlay={() => setEstado('pronta')}
        onError={() => setEstado('erro')}
      />
      {estado === 'carregando' && (
        <p className="texto-fraco" role="status">
          Carregando a prévia…
        </p>
      )}
      {estado === 'erro' && (
        <p className="erro" role="alert">
          Não deu para tocar a prévia. Tente abrir no YouTube.
        </p>
      )}
      <div className="previa__acoes">
        <button type="button" className="botao" onClick={aoFechar}>
          <X size={16} aria-hidden />
          Fechar a prévia
        </button>
        <a
          className="botao"
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(idVideo)}&t=${Math.floor(inicio)}s`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} aria-hidden />
          Abrir no YouTube
        </a>
      </div>
    </div>
  )
}
