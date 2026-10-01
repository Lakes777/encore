import { ExternalLink, X } from 'lucide-react'
import { urlDaPrevia } from '../logica/youtube.ts'

interface Props {
  idVideo: string
  inicio: number
  titulo: string
  aoFechar: () => void
}

/** Player do YouTube embutido tocando só os 15 s da prévia. */
export function Previa({ idVideo, inicio, titulo, aoFechar }: Props) {
  return (
    <div className="previa">
      <iframe
        className="previa__video"
        src={urlDaPrevia(idVideo, inicio)}
        title={`Prévia de ${titulo}`}
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="previa__acoes">
        <button type="button" className="botao" onClick={aoFechar}>
          <X size={16} aria-hidden />
          Fechar a prévia
        </button>
        {/* Gravadoras costumam bloquear o player embutido em sites locais: aí só no YouTube */}
        <a className="botao" href={`https://www.youtube.com/watch?v=${encodeURIComponent(idVideo)}&t=${Math.floor(inicio)}s`} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden />
          Abrir no YouTube
        </a>
      </div>
    </div>
  )
}
