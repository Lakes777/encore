import { Volume2, VolumeX } from 'lucide-react'
import type { Faixa } from '../logica/tipos.ts'
import { eOriginal, type EstadoVolumes } from '../logica/volumes.ts'

interface Props {
  faixas: readonly Faixa[]
  estado: EstadoVolumes
  aoMudar: (estado: EstadoVolumes) => void
}

/** Um controle por faixa (menos a original) e o botão "Tocar a original". */
export function Volumes({ faixas, estado, aoMudar }: Props) {
  const temOriginal = faixas.some(eOriginal)
  const { tocandoOriginal } = estado

  return (
    <section className="volumes" aria-labelledby="titulo-volumes">
      <h2 id="titulo-volumes" className="tela-musica__subtitulo">
        Volumes
      </h2>
      <ul className="volumes__lista">
        {faixas
          .filter((faixa) => !eOriginal(faixa))
          .map((faixa) => {
            const volume = estado.volumes[faixa.arquivo] ?? faixa.volume
            const mudo = Boolean(estado.mudos[faixa.arquivo])
            const porcento = Math.round(volume * 100)
            return (
              <li key={faixa.arquivo} className="volumes__faixa">
                <button
                  type="button"
                  className="botao botao--icone"
                  aria-pressed={mudo}
                  aria-label={`Silenciar ${faixa.nome}`}
                  title={mudo ? `Ligar ${faixa.nome}` : `Silenciar ${faixa.nome}`}
                  disabled={tocandoOriginal}
                  onClick={() => aoMudar({ ...estado, mudos: { ...estado.mudos, [faixa.arquivo]: !mudo } })}
                >
                  {mudo ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </button>
                <label className="volumes__rotulo">
                  <span className="volumes__nome">{faixa.nome}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={porcento}
                    disabled={tocandoOriginal}
                    aria-label={`Volume de ${faixa.nome}`}
                    aria-valuetext={`${porcento}%`}
                    onChange={(evento) =>
                      aoMudar({
                        ...estado,
                        volumes: { ...estado.volumes, [faixa.arquivo]: Number(evento.target.value) / 100 },
                      })
                    }
                  />
                </label>
                <span className={`volumes__porcento${mudo ? ' texto-fraco' : ''}`} aria-hidden>
                  {mudo ? 'mudo' : `${porcento}%`}
                </span>
              </li>
            )
          })}
      </ul>
      {temOriginal && (
        <>
          <button
            type="button"
            className={`botao${tocandoOriginal ? ' botao--principal' : ''}`}
            aria-pressed={tocandoOriginal}
            onClick={() => aoMudar({ ...estado, tocandoOriginal: !tocandoOriginal })}
          >
            Tocar a original
          </button>
          {tocandoOriginal && (
            <p className="texto-fraco">Tocando a música original. Desligue para voltar aos volumes acima.</p>
          )}
        </>
      )}
    </section>
  )
}
