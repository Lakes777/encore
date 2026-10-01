import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import './Dialogo.css'

interface Props {
  titulo: string
  aoFechar: () => void
  children: ReactNode
}

/**
 * Janela por cima da tela. Não usa <dialog>.showModal() porque o jsdom dos testes
 * não tem; é uma div com role="dialog" que fecha com Esc, com o botão Fechar ou
 * clicando fora. Ao fechar, o foco volta para o botão que abriu.
 */
export function Dialogo({ titulo, aoFechar, children }: Props) {
  const idTitulo = useId()
  const caixa = useRef<HTMLDivElement>(null)
  // Guardado num ref para o efeito não rodar de novo a cada desenho do pai.
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  })

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    caixa.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fechar.current()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      antes?.focus?.()
    }
  }, [])

  return (
    <div
      className="dialogo__fundo"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar()
      }}
    >
      <div ref={caixa} className="dialogo cartao" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}>
        <div className="dialogo__topo">
          <h2 id={idTitulo}>{titulo}</h2>
          <button type="button" className="botao botao--icone" aria-label="Fechar" title="Fechar" onClick={aoFechar}>
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
