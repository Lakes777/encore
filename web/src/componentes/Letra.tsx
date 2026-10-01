import { useEffect, useRef } from 'react'
import { indiceDoVersoAtual, letraSincronizada } from '../logica/letra.ts'
import type { Verso } from '../logica/tipos.ts'

/** Quantos versos antes e depois do atual ficam "perto" (menos apagados). */
const VERSOS_PERTO = 2

interface Props {
  versos: readonly Verso[]
  tempo: number
  aoPular: (segundos: number) => void
}

/**
 * Letra sincronizada: o verso atual em destaque e centralizado; clicar num verso
 * pula a música para ele. Letra sem tempo: o texto inteiro, parado e rolável.
 */
export function Letra({ versos, tempo, aoPular }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const sincronizada = letraSincronizada(versos)
  const atual = sincronizada ? indiceDoVersoAtual(versos, tempo) : -1

  // Rola a caixa (e não a página) para deixar o verso atual no meio.
  useEffect(() => {
    const elemento = caixa.current
    if (!sincronizada || !elemento || typeof elemento.scrollTo !== 'function') return
    const verso = elemento.querySelector<HTMLElement>('[data-atual="true"]')
    const alvo = verso ? verso.offsetTop - elemento.clientHeight / 2 + verso.offsetHeight / 2 : 0
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    elemento.scrollTo({ top: Math.max(0, alvo), behavior: reduzido ? 'auto' : 'smooth' })
  }, [atual, sincronizada])

  if (!sincronizada) {
    return (
      <div className="letra letra--parada" tabIndex={0} aria-label="Letra">
        {versos.map((verso, indice) => (
          <p key={indice} className="letra__linha">
            {verso.texto || ' '}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="letra" ref={caixa}>
      <ol className="letra__lista" aria-label="Letra">
        {versos.map((verso, indice) => {
          const distancia = atual === -1 ? indice + 1 : Math.abs(indice - atual)
          const classe = indice === atual ? 'letra__verso--atual' : distancia <= VERSOS_PERTO ? 'letra__verso--perto' : ''
          const { tempo: inicio } = verso
          return (
            <li key={indice} data-atual={indice === atual}>
              {inicio == null ? (
                <span className={`letra__verso ${classe}`}>{verso.texto || ' '}</span>
              ) : (
                <button
                  type="button"
                  className={`letra__verso ${classe}`}
                  aria-current={indice === atual ? 'true' : undefined}
                  title="Pular para este verso"
                  onClick={() => aoPular(inicio)}
                >
                  {verso.texto || '…'}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
