interface Props {
  bpm: number | null
  velocidade: number
  ligado: boolean
  volume: number
  aoLigar: (ligado: boolean) => void
  aoMudarVolume: (volume: number) => void
}

/** Liga/desliga o metrônomo e o volume dele; mostra o BPM (e o da velocidade atual). */
export function Metronomo({ bpm, velocidade, ligado, volume, aoLigar, aoMudarVolume }: Props) {
  const porcento = Math.round(volume * 100)
  const naVelocidade = bpm != null && velocidade !== 1 ? Math.round(bpm * velocidade) : null
  return (
    <section className="metronomo" aria-labelledby="titulo-metronomo">
      <h2 id="titulo-metronomo" className="tela-musica__subtitulo">
        Metrônomo
      </h2>
      <div className="metronomo__linha">
        <button
          type="button"
          className={`botao${ligado ? ' botao--principal' : ''}`}
          aria-pressed={ligado}
          onClick={() => aoLigar(!ligado)}
        >
          {ligado ? 'Ligado' : 'Desligado'}
        </button>
        {bpm != null && (
          <span className="metronomo__bpm">
            {Math.round(bpm)} BPM
            {naVelocidade != null && <span className="texto-fraco"> ({naVelocidade} agora)</span>}
          </span>
        )}
      </div>
      <label className="metronomo__volume">
        <span>Volume do clique</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={porcento}
          aria-valuetext={`${porcento}%`}
          onChange={(evento) => aoMudarVolume(Number(evento.target.value) / 100)}
        />
      </label>
    </section>
  )
}
