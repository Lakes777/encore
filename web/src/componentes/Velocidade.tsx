import { PASSO_DA_VELOCIDADE, VELOCIDADE_MAXIMA, VELOCIDADE_MINIMA, ajustarVelocidade } from '../logica/velocidade.ts'

interface Props {
  velocidade: number
  aoMudar: (velocidade: number) => void
}

/** Controle da velocidade, em %; a letra segue sozinha (ela anda pelo tempo da música). */
export function Velocidade({ velocidade, aoMudar }: Props) {
  const porcento = Math.round(velocidade * 100)
  return (
    <section className="velocidade" aria-labelledby="titulo-velocidade">
      <h2 id="titulo-velocidade" className="tela-musica__subtitulo">
        Velocidade
      </h2>
      <div className="velocidade__linha">
        <input
          type="range"
          min={VELOCIDADE_MINIMA * 100}
          max={VELOCIDADE_MAXIMA * 100}
          step={PASSO_DA_VELOCIDADE * 100}
          value={porcento}
          aria-label="Velocidade da música"
          aria-valuetext={`${porcento}%`}
          onChange={(evento) => aoMudar(ajustarVelocidade(Number(evento.target.value) / 100))}
        />
        <span className="velocidade__porcento" aria-hidden>
          {porcento}%
        </span>
        <button
          type="button"
          className="botao"
          disabled={porcento === 100}
          title="Voltar à velocidade normal"
          onClick={() => aoMudar(1)}
        >
          Normal
        </button>
      </div>
    </section>
  )
}
