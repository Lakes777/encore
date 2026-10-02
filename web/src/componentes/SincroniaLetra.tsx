import { useState } from 'react'
import { api, ErroApi } from '../logica/api.ts'
import { formatarAtraso } from '../logica/formatar.ts'

/** Quanto cada clique desloca a letra. */
const PASSO = 0.1

interface Props {
  idMusica: string
  /** O que o usuário salvou (null = automático). */
  atrasoSalvo: number | null
  /** O que o site calculou com os trechos de voz (null = não deu para calcular). */
  estimado: number | null
  aoMudar: (atrasoSalvo: number | null) => void
}

/** Adianta ou atrasa a letra; cada clique já salva. "Automático" volta ao valor calculado. */
export function SincroniaLetra({ idMusica, atrasoSalvo, estimado, aoMudar }: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const atual = atrasoSalvo ?? estimado ?? 0

  async function definir(novo: number | null) {
    const anterior = atrasoSalvo
    aoMudar(novo)
    setErro(null)
    try {
      await api.definirAtrasoLetra(idMusica, novo)
    } catch (motivo) {
      aoMudar(anterior)
      setErro(motivo instanceof ErroApi ? motivo.message : 'Não deu para salvar a sincronia da letra.')
    }
  }

  const deslocar = (passo: number) => void definir(Math.round((atual + passo) * 100) / 100)

  return (
    <section className="sincronia" aria-labelledby="titulo-sincronia">
      <h2 id="titulo-sincronia" className="tela-musica__subtitulo">
        Sincronia da letra
      </h2>
      <div className="sincronia__linha">
        <button type="button" className="botao" aria-label="Adiantar a letra 0,1 segundo" onClick={() => deslocar(-PASSO)}>
          −0,1 s
        </button>
        <span className="sincronia__valor" role="status">
          {formatarAtraso(atual)}
          <span className="texto-fraco"> {atrasoSalvo == null ? (estimado == null ? '' : '(automático)') : '(ajustado)'}</span>
        </span>
        <button type="button" className="botao" aria-label="Atrasar a letra 0,1 segundo" onClick={() => deslocar(PASSO)}>
          +0,1 s
        </button>
      </div>
      {atrasoSalvo != null && (
        <button type="button" className="botao sincronia__automatico" onClick={() => void definir(null)}>
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
