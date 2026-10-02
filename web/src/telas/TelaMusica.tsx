import { ArrowLeft, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ControleDesfoque } from '../componentes/ControleDesfoque.tsx'
import { Letra } from '../componentes/Letra.tsx'
import { SincroniaLetra } from '../componentes/SincroniaLetra.tsx'
import { Velocidade } from '../componentes/Velocidade.tsx'
import { Volumes } from '../componentes/Volumes.tsx'
import { api, ErroApi, urlDaFaixa } from '../logica/api.ts'
import { descricaoTom, formatarDuracao } from '../logica/formatar.ts'
import { deslocarVersos, estimarAtraso, letraSincronizada } from '../logica/letra.ts'
import { LINK_INICIO } from '../logica/rota.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { DESFOQUE_PADRAO, type Musica, type Verso } from '../logica/tipos.ts'
import { usePlayer } from '../logica/usePlayer.ts'
import { useSalvarVolumes } from '../logica/useSalvarVolumes.ts'
import { estadoInicialDosVolumes, volumeEfetivo } from '../logica/volumes.ts'
import './TelaMusica.css'

/** Quanto os botões de voltar/avançar pulam. */
const PULO = 5

type Carregamento =
  | { estado: 'carregando' }
  | { estado: 'erro'; mensagem: string }
  | { estado: 'pronta'; musica: Musica; versos: Verso[] | null; erroLetra: string | null }

/** Tela da música: carrega a música e a letra; o player só aparece com as duas em mãos. */
export function TelaMusica({ id }: { id: string }) {
  const [carregamento, setCarregamento] = useState<Carregamento>({ estado: 'carregando' })

  useEffect(() => {
    let valendo = true
    const letra = api.letra(id).then(
      (versos) => ({ versos, erroLetra: null }),
      // 404 = a música ainda não tem letra; outro erro não impede de tocar.
      (motivo: unknown) => ({
        versos: null,
        erroLetra: motivo instanceof ErroApi && motivo.status === 404 ? null : mensagemDoErro(motivo),
      }),
    )
    Promise.all([api.musica(id), letra]).then(
      ([musica, { versos, erroLetra }]) => {
        if (valendo) setCarregamento({ estado: 'pronta', musica, versos, erroLetra })
      },
      (motivo: unknown) => {
        if (valendo) setCarregamento({ estado: 'erro', mensagem: mensagemDoErro(motivo) })
      },
    )
    return () => {
      valendo = false
    }
  }, [id])

  if (carregamento.estado === 'carregando') {
    return (
      <main className="pagina">
        <p className="texto-fraco" role="status">
          Carregando a música…
        </p>
      </main>
    )
  }

  if (carregamento.estado === 'erro') {
    return (
      <main className="pagina">
        <p className="erro" role="alert">
          {carregamento.mensagem}
        </p>
        <a href={LINK_INICIO}>Voltar para o início</a>
      </main>
    )
  }

  return <Player musica={carregamento.musica} versos={carregamento.versos} erroLetra={carregamento.erroLetra} />
}

/** Foco num campo (ou botão): a barra de espaço é dele, não do play. */
function focoEmCampo(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return false
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(alvo.tagName)
}

function Player({ musica, versos, erroLetra }: { musica: Musica; versos: Verso[] | null; erroLetra: string | null }) {
  const { faixas } = musica
  const [velocidade, setVelocidade] = useState(1)
  const sincronizada = versos != null && letraSincronizada(versos)
  const estimado = useMemo(
    () => (sincronizada && versos ? estimarAtraso(versos, musica.trechos_voz ?? []) : null),
    [sincronizada, versos, musica.trechos_voz],
  )
  const [atrasoSalvo, setAtrasoSalvo] = useState<number | null>(musica.atraso_letra ?? null)
  const atraso = atrasoSalvo ?? estimado ?? 0
  const versosNoTempo = useMemo(() => (versos ? deslocarVersos(versos, atraso) : null), [versos, atraso])
  const player = usePlayer(faixas, musica.duracao, velocidade)
  const [volumes, setVolumes] = useState(() => estadoInicialDosVolumes(faixas))
  const salvamento = useSalvarVolumes(musica.id, faixas, volumes.volumes)
  const [desfoque, setDesfoque] = useState(() => musica.fundo?.desfoque ?? DESFOQUE_PADRAO)
  const conteiner = useRef<HTMLDivElement>(null)
  const [telaCheia, setTelaCheia] = useState(false)
  const podeTelaCheia = typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false

  // Os volumes vão direto para os <audio>.
  useEffect(() => {
    faixas.forEach((faixa, indice) => {
      const audio = player.audios.current[indice]
      if (audio) audio.volume = volumeEfetivo(faixa, volumes)
    })
  }, [faixas, volumes, player.audios])

  // Barra de espaço = tocar/pausar (useEffectEvent: sempre vê o estado mais novo).
  const aoTeclar = useEffectEvent((evento: KeyboardEvent) => {
    if (evento.code !== 'Space' && evento.key !== ' ') return
    if (focoEmCampo(evento.target) || !player.todasProntas) return
    evento.preventDefault()
    player.alternar()
  })
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => aoTeclar(evento)
    window.addEventListener('keydown', ouvir)
    return () => window.removeEventListener('keydown', ouvir)
  }, [])

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement != null)
    document.addEventListener('fullscreenchange', aoMudar)
    return () => document.removeEventListener('fullscreenchange', aoMudar)
  }, [])

  function alternarTelaCheia() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void conteiner.current?.requestFullscreen()
  }

  const urlFundo = musica.fundo?.url
  const { tempo, duracao, tocando, todasProntas } = player

  return (
    <div className="tela-musica" ref={conteiner}>
      {urlFundo && (
        <>
          <div
            className="tela-musica__fundo"
            data-testid="fundo"
            style={{ backgroundImage: `url("${urlFundo}")`, filter: `blur(${desfoque}px)` }}
          />
          <div className="tela-musica__veu" />
        </>
      )}

      <header className="tela-musica__topo">
        <a href={LINK_INICIO} className="botao botao--icone" aria-label="Voltar para o início" title="Voltar">
          <ArrowLeft size={18} aria-hidden />
        </a>
        <div className="tela-musica__nome">
          <h1>{musica.titulo}</h1>
          <p className="texto-fraco">
            {musica.artista} · {descricaoTom(musica)}
          </p>
        </div>
        {podeTelaCheia && (
          <button
            type="button"
            className="botao botao--icone"
            aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            onClick={alternarTelaCheia}
          >
            {telaCheia ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
          </button>
        )}
      </header>

      <div className="tela-musica__corpo">
        <section className="tela-musica__letra" aria-label="Letra da música">
          {versos && versos.length > 0 ? (
            <Letra versos={versosNoTempo ?? versos} tempo={tempo} aoPular={player.pular} />
          ) : (
            <div className="tela-musica__sem-letra">
              <p>{erroLetra ?? 'Essa música ainda não tem letra.'}</p>
              <a href={LINK_INICIO}>Escolher a letra na tela inicial</a>
            </div>
          )}
        </section>

        <aside className="tela-musica__painel">
          <Volumes faixas={faixas} estado={volumes} aoMudar={setVolumes} />
          <p className="texto-fraco" role="status">
            {salvamento.estado === 'salvando' ? 'Salvando os volumes…' : salvamento.estado === 'salvo' ? 'Volumes salvos' : ''}
          </p>
          {salvamento.erro && (
            <p className="erro" role="alert">
              {salvamento.erro}
            </p>
          )}
          <Velocidade velocidade={velocidade} aoMudar={setVelocidade} />
          {sincronizada && (
            <SincroniaLetra idMusica={musica.id} atrasoSalvo={atrasoSalvo} estimado={estimado} aoMudar={setAtrasoSalvo} />
          )}
          {urlFundo && (
            <ControleDesfoque idMusica={musica.id} url={urlFundo} desfoque={desfoque} aoMudar={setDesfoque} />
          )}
        </aside>
      </div>

      <section className="tela-musica__controles" aria-label="Player">
        <div className="tela-musica__tempo">
          <span>{formatarDuracao(tempo)}</span>
          <input
            type="range"
            min={0}
            max={duracao || 0}
            step={0.1}
            value={Math.min(tempo, duracao || 0)}
            disabled={!todasProntas}
            aria-label="Posição na música"
            aria-valuetext={`${formatarDuracao(tempo)} de ${formatarDuracao(duracao)}`}
            onChange={(evento) => player.pular(Number(evento.target.value))}
          />
          <span>{formatarDuracao(duracao)}</span>
        </div>
        <div className="tela-musica__botoes">
          <button
            type="button"
            className="botao botao--icone"
            aria-label={`Voltar ${PULO} segundos`}
            title={`Voltar ${PULO} s`}
            disabled={!todasProntas}
            onClick={() => player.pular(tempo - PULO)}
          >
            <RotateCcw size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="botao botao--principal tela-musica__play"
            aria-label={tocando ? 'Pausar' : 'Tocar'}
            title={tocando ? 'Pausar (espaço)' : 'Tocar (espaço)'}
            disabled={!todasProntas}
            onClick={player.alternar}
          >
            {tocando ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
          </button>
          <button
            type="button"
            className="botao botao--icone"
            aria-label={`Avançar ${PULO} segundos`}
            title={`Avançar ${PULO} s`}
            disabled={!todasProntas}
            onClick={() => player.pular(tempo + PULO)}
          >
            <RotateCw size={18} aria-hidden />
          </button>
        </div>
        <p className="texto-fraco tela-musica__aviso" role="status">
          {player.erro ?? (todasProntas ? '' : 'Carregando as faixas…')}
        </p>
      </section>

      {faixas.map((faixa, indice) => (
        <audio key={faixa.arquivo} src={urlDaFaixa(musica.id, faixa.arquivo)} {...player.propsDoAudio(indice)} />
      ))}
    </div>
  )
}
