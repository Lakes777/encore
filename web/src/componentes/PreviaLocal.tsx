import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { DURACAO_PREVIA } from '../logica/youtube.ts'

interface Props {
  url: string
  inicio: number
  titulo: string
  aoFechar: () => void
}

/**
 * Prévia de uma música já baixada: toca o áudio original do próprio computador.
 * O player embutido do YouTube recusa muitas músicas de gravadora quando o site
 * é local (127.0.0.1), e aqui o arquivo já está na mão: sem anúncio e na hora.
 */
export function PreviaLocal({ url, inicio, titulo, aoFechar }: Props) {
  const audio = useRef<HTMLAudioElement>(null)

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
      <audio ref={audio} src={url} controls preload="metadata" aria-label={`Prévia de ${titulo}`} />
      <button type="button" className="botao" onClick={aoFechar}>
        <X size={16} aria-hidden />
        Fechar a prévia
      </button>
    </div>
  )
}
