import { X } from 'lucide-react'
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
      <button type="button" className="botao" onClick={aoFechar}>
        <X size={16} aria-hidden />
        Fechar a prévia
      </button>
    </div>
  )
}
