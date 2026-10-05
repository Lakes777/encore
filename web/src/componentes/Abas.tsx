import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface Aba {
  id: string
  rotulo: string
  conteudo: ReactNode
}

interface Props {
  abas: readonly Aba[]
  /** Nome da lista de abas para o leitor de tela. */
  rotulo: string
  /** Algo ao lado das abas (ex.: o botão de fechar o painel). */
  extra?: ReactNode
  /** Aba que começa aberta (se não existir, a primeira). */
  inicial?: string
  /** Avisado quando a pessoa troca de aba (clique ou teclado). */
  aoTrocar?: (id: string) => void
}

/**
 * Abas acessíveis (padrão tablist do WAI-ARIA): setas, Home e End trocam de aba.
 * As que não estão abertas ficam montadas, só escondidas: assim nada que estava
 * salvando ou tocando (metrônomo, sincronia da letra) é interrompido ao trocar.
 */
export function Abas({ abas, rotulo, extra, inicial, aoTrocar }: Props) {
  const base = useId()
  const [escolhida, setEscolhida] = useState(inicial ?? abas[0]?.id)
  // Se a aba escolhida deixar de existir, volta para a primeira
  const ativa = abas.some((aba) => aba.id === escolhida) ? escolhida : abas[0]?.id
  const botoes = useRef(new Map<string, HTMLButtonElement>())

  function escolher(id: string) {
    setEscolhida(id)
    aoTrocar?.(id)
  }

  function aoTeclar(evento: KeyboardEvent) {
    const indice = abas.findIndex((aba) => aba.id === ativa)
    const destino = {
      ArrowRight: (indice + 1) % abas.length,
      ArrowLeft: (indice - 1 + abas.length) % abas.length,
      Home: 0,
      End: abas.length - 1,
    }[evento.key]
    if (destino == null) return
    evento.preventDefault()
    const id = abas[destino].id
    escolher(id)
    botoes.current.get(id)?.focus()
  }

  return (
    <div className="abas">
      <div className="abas__topo">
        <div className="abas__lista" role="tablist" aria-label={rotulo} onKeyDown={aoTeclar}>
          {abas.map((aba) => (
            <button
              key={aba.id}
              ref={(elemento) => {
                if (elemento) botoes.current.set(aba.id, elemento)
                else botoes.current.delete(aba.id)
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${aba.id}`}
              className="abas__aba"
              aria-selected={aba.id === ativa}
              aria-controls={`${base}-painel-${aba.id}`}
              tabIndex={aba.id === ativa ? 0 : -1}
              onClick={() => escolher(aba.id)}
            >
              {aba.rotulo}
            </button>
          ))}
        </div>
        {extra}
      </div>
      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`${base}-painel-${aba.id}`}
          className="abas__painel"
          aria-labelledby={`${base}-aba-${aba.id}`}
          hidden={aba.id !== ativa}
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  )
}
