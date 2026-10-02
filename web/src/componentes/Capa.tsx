import { Music } from 'lucide-react'
import { useState } from 'react'

interface Props {
  /** null = sem imagem: fica o bloco neutro com o ícone. */
  url: string | null
  className?: string
}

/**
 * Capa decorativa (alt vazio: o nome da música já está escrito ao lado).
 * Se a imagem não carregar (link quebrado, sem internet), cai no bloco neutro.
 */
export function Capa({ url, className = '' }: Props) {
  const [quebrada, setQuebrada] = useState<string | null>(null)
  const classe = `capa ${className}`.trim()
  if (!url || quebrada === url) {
    return (
      <div className={`${classe} capa--vazia`} data-testid="capa" aria-hidden>
        <Music size={20} aria-hidden />
      </div>
    )
  }
  return (
    <div className={classe} data-testid="capa" aria-hidden>
      <img src={url} alt="" loading="lazy" decoding="async" onError={() => setQuebrada(url)} />
    </div>
  )
}
