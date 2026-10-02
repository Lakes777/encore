import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { api } from '../logica/api.ts'
import { formatarAtraso } from '../logica/formatar.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { ESPERA_PARA_SALVAR } from '../logica/useSalvarVolumes.ts'

/** Quanto cada clique desloca a letra. */
const PASSO = 0.1
/** O mesmo limite do servidor (ATRASO_MAXIMO em biblioteca.py). */
export const ATRASO_MAXIMO = 10

interface Props {
  idMusica: string
  /** O que o usuário salvou (null = automático). */
  atrasoSalvo: number | null
  /** O que o site calculou com os trechos de voz (null = não deu para calcular). */
  estimado: number | null
  aoMudar: (atrasoSalvo: number | null) => void
}

/**
 * Adianta ou atrasa a letra. A tela muda na hora; o servidor recebe só o valor final,
 * um pouco depois do último clique (cliques seguidos viram um pedido só).
 * "Automático" volta ao valor calculado.
 */
export function SincroniaLetra({ idMusica, atrasoSalvo, estimado, aoMudar }: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const atual = atrasoSalvo ?? estimado ?? 0
  // O que o servidor tem de fato (para onde a tela volta se salvar falhar)
  const confirmado = useRef(atrasoSalvo)
  const pendente = useRef<{ valor: number | null } | null>(null)
  const espera = useRef<number | undefined>(undefined)
  const ultimoPedido = useRef(0)

  function enviar() {
    if (!pendente.current) return
    const { valor } = pendente.current
    pendente.current = null
    const numero = ++ultimoPedido.current
    api.definirAtrasoLetra(idMusica, valor).then(
      () => {
        if (numero === ultimoPedido.current) confirmado.current = valor
      },
      (motivo) => {
        // Só o pedido mais recente decide: um antigo que falhou não desfaz um novo
        if (numero !== ultimoPedido.current) return
        aoMudar(confirmado.current)
        setErro(`Não deu para salvar a sincronia da letra: ${mensagemDoErro(motivo)}`)
      },
    )
  }

  // Saiu da tela antes da espera acabar: salva mesmo assim
  const aoSair = useEffectEvent(() => {
    window.clearTimeout(espera.current)
    enviar()
  })
  useEffect(() => () => aoSair(), [])

  function definir(novo: number | null) {
    aoMudar(novo)
    setErro(null)
    pendente.current = { valor: novo }
    window.clearTimeout(espera.current)
    espera.current = window.setTimeout(enviar, ESPERA_PARA_SALVAR)
  }

  const deslocar = (passo: number) => definir(Math.round((atual + passo) * 100) / 100)

  return (
    <section className="sincronia" aria-labelledby="titulo-sincronia">
      <h2 id="titulo-sincronia" className="tela-musica__subtitulo">
        Sincronia da letra
      </h2>
      <div className="sincronia__linha">
        <button
          type="button"
          className="botao"
          aria-label="Adiantar a letra 0,1 segundo"
          disabled={atual - PASSO < -ATRASO_MAXIMO}
          onClick={() => deslocar(-PASSO)}
        >
          −0,1 s
        </button>
        <span className="sincronia__valor" role="status">
          {formatarAtraso(atual)}
          <span className="texto-fraco"> {atrasoSalvo == null ? (estimado == null ? '' : '(automático)') : '(ajustado)'}</span>
        </span>
        <button
          type="button"
          className="botao"
          aria-label="Atrasar a letra 0,1 segundo"
          disabled={atual + PASSO > ATRASO_MAXIMO}
          onClick={() => deslocar(PASSO)}
        >
          +0,1 s
        </button>
      </div>
      {atrasoSalvo != null && (
        <button type="button" className="botao sincronia__automatico" onClick={() => definir(null)}>
          Voltar ao automático
        </button>
      )}
      <p className="texto-fraco">Letra acendendo antes da voz: atrase. Depois: adiante.</p>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  )
}
