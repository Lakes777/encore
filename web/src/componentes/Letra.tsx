import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { indiceDoVersoAtual, letraSincronizada, type TrechoDeVoz } from '../logica/letra.ts'
import { preenchimento, tempoDasPalavras } from '../logica/palavras.ts'
import type { Verso } from '../logica/tipos.ts'

/** Quantos versos antes e depois do atual ficam "perto" (menos apagados). */
const VERSOS_PERTO = 2

interface Props {
  versos: readonly Verso[]
  tempo: number
  aoPular: (segundos: number) => void
  /** Onde a voz principal soa: guia a palavra que acende (sem isto, estima pelo ritmo médio). */
  trechos?: readonly TrechoDeVoz[]
}

const SEM_TRECHOS: TrechoDeVoz[] = []

/**
 * Letra sincronizada: o verso atual em destaque e centralizado; clicar num verso
 * pula a música para ele. Letra sem tempo: o texto inteiro, parado e rolável.
 */
export function Letra({ versos, tempo, aoPular, trechos = SEM_TRECHOS }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const sincronizada = letraSincronizada(versos)
  const atual = sincronizada ? indiceDoVersoAtual(versos, tempo) : -1

  // Palavras do verso atual: o verso vai até o começo do próximo que tenha tempo
  const palavras = useMemo(() => {
    const verso = versos[atual]
    if (verso?.tempo == null) return null
    const inicio = verso.tempo
    const proximo = versos.slice(atual + 1).find((v) => v.tempo != null && v.tempo > inicio)
    return tempoDasPalavras(verso.texto, inicio, proximo?.tempo ?? null, trechos)
  }, [versos, atual, trechos])

  // Rola a caixa (e não a página) para deixar o verso atual no meio.
  useEffect(() => {
    if (sincronizada) centralizar(caixa.current, true)
  }, [atual, sincronizada])

  // A caixa mudou de altura (gaveta de controles abriu ou fechou, janela mudou):
  // centraliza de novo, sem esperar o próximo verso.
  useEffect(() => {
    const elemento = caixa.current
    if (!sincronizada || !elemento || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(() => centralizar(elemento, false))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [sincronizada])

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
                  {indice === atual && palavras && palavras.length > 0
                    ? palavras.map((palavra, posicao) => (
                        <Fragment key={posicao}>
                          {posicao > 0 && ' '}
                          <span
                            className="letra__palavra"
                            style={{ '--preenchido': `${Math.round(preenchimento(palavra, tempo) * 100)}%` } as CSSProperties}
                          >
                            {palavra.texto}
                          </span>
                        </Fragment>
                      ))
                    : verso.texto || '…'}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Põe o verso atual no meio da caixa (com rolagem suave, se pedido e se a pessoa não preferir menos movimento). */
function centralizar(elemento: HTMLDivElement | null, suave: boolean) {
  if (!elemento || typeof elemento.scrollTo !== 'function') return
  const verso = elemento.querySelector<HTMLElement>('[data-atual="true"]')
  const alvo = verso ? verso.offsetTop - elemento.clientHeight / 2 + verso.offsetHeight / 2 : 0
  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  elemento.scrollTo({ top: Math.max(0, alvo), behavior: suave && !reduzido ? 'smooth' : 'auto' })
}
