import { ArrowLeft, LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as EventoDeTecla } from 'react'
import { Abas, type Aba } from '../componentes/Abas.tsx'
import { Capa } from '../componentes/Capa.tsx'
import { ControleDesfoque } from '../componentes/ControleDesfoque.tsx'
import { Letra } from '../componentes/Letra.tsx'
import { Metronomo } from '../componentes/Metronomo.tsx'
import { SincroniaLetra } from '../componentes/SincroniaLetra.tsx'
import { Velocidade } from '../componentes/Velocidade.tsx'
import { Volumes } from '../componentes/Volumes.tsx'
import { lerAbaDaMusica, salvarAbaDaMusica } from '../logica/abaDaMusica.ts'
import { api, ErroApi, urlDaFaixa } from '../logica/api.ts'
import { descricaoTom, formatarDuracao, nomeDaMusica } from '../logica/formatar.ts'
import { deslocarVersos, estimarAtraso, letraSincronizada } from '../logica/letra.ts'
import { LINK_INICIO } from '../logica/rota.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { DESFOQUE_PADRAO, type Musica, type Verso } from '../logica/tipos.ts'
import { useMetronomo } from '../logica/useMetronomo.ts'
import { usePlayer } from '../logica/usePlayer.ts'
import { useSalvarVolumes } from '../logica/useSalvarVolumes.ts'
import { estadoInicialDosVolumes, volumeEfetivo } from '../logica/volumes.ts'
import { capaDaMusica } from '../logica/youtube.ts'
import { useCoresDaCapa } from '../logica/cores.ts'
import './TelaMusica.css'

/** Quanto os botões de voltar/avançar pulam. */
const PULO = 5
/** Lista vazia fixa: uma nova a cada render reiniciaria o metrônomo. */
const SEM_BATIDAS: number[] = []
/** Daqui para cima o painel fica ao lado da letra e começa aberto; abaixo, vira gaveta fechada. */
export const TELA_LARGA = '(min-width: 900px)'

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
      <main className="pagina tela-musica__espera">
        <LoaderCircle size={28} className="girando" aria-hidden />
        <p className="texto-fraco" role="status">
          Carregando a música…
        </p>
      </main>
    )
  }

  if (carregamento.estado === 'erro') {
    return (
      <main className="pagina tela-musica__espera">
        <p className="erro" role="alert">
          {carregamento.mensagem}
        </p>
        <a href={LINK_INICIO} className="botao">
          <ArrowLeft size={16} aria-hidden />
          Voltar para o início
        </a>
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
  const batidas = musica.batidas ?? SEM_BATIDAS
  const [metronomoLigado, setMetronomoLigado] = useState(false)
  const [volumeMetronomo, setVolumeMetronomo] = useState(0.6)
  useMetronomo({
    batidas,
    ligado: metronomoLigado,
    tocando: player.tocando,
    volume: volumeMetronomo,
    velocidade,
    tempoDaMusica: player.tempoAgora,
  })
  const [volumes, setVolumes] = useState(() => estadoInicialDosVolumes(faixas))
  const salvamento = useSalvarVolumes(musica.id, faixas, volumes.volumes)
  const [desfoque, setDesfoque] = useState(() => musica.fundo?.desfoque ?? DESFOQUE_PADRAO)
  const conteiner = useRef<HTMLDivElement>(null)
  const [telaCheia, setTelaCheia] = useState(false)
  const podeTelaCheia = typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false
  // Sem matchMedia (como no jsdom), trata como tela larga: painel aberto.
  const [painelAberto, setPainelAberto] = useState(() => window.matchMedia?.(TELA_LARGA).matches ?? true)
  const botaoControles = useRef<HTMLButtonElement>(null)
  // A última aba escolhida (lida uma vez só; sem Ajustes nesta música, as Abas caem na primeira)
  const [abaInicial] = useState(() => lerAbaDaMusica() ?? undefined)
  // Destaques na cor da capa (o roxo padrão enquanto lê ou se a capa não deixar ler)
  const paleta = useCoresDaCapa(capaDaMusica(musica))

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

  function fecharPainel() {
    setPainelAberto(false)
    botaoControles.current?.focus()
  }

  // Esc dentro do painel fecha (e o foco volta para o botão que abre).
  function teclaNoPainel(evento: EventoDeTecla) {
    if (evento.key !== 'Escape') return
    evento.stopPropagation()
    fecharPainel()
  }

  const urlFundo = musica.fundo?.url
  const { tempo, duracao, tocando, todasProntas } = player
  const nome = nomeDaMusica(musica)

  const abas: Aba[] = [
    {
      id: 'volumes',
      rotulo: 'Volumes',
      conteudo: (
        <>
          <Volumes faixas={faixas} estado={volumes} aoMudar={setVolumes} />
          <p className="texto-fraco tela-musica__salvamento" role="status">
            {salvamento.estado === 'salvando' ? 'Salvando os volumes…' : salvamento.estado === 'salvo' ? 'Volumes salvos' : ''}
          </p>
        </>
      ),
    },
    {
      id: 'treino',
      rotulo: 'Treino',
      conteudo: (
        <>
          <Velocidade velocidade={velocidade} aoMudar={setVelocidade} />
          {batidas.length > 0 && (
            <Metronomo
              bpm={musica.bpm ?? null}
              velocidade={velocidade}
              ligado={metronomoLigado}
              volume={volumeMetronomo}
              aoLigar={setMetronomoLigado}
              aoMudarVolume={setVolumeMetronomo}
            />
          )}
        </>
      ),
    },
  ]
  // Ajustes só aparece quando há algo para ajustar
  if (sincronizada || urlFundo) {
    abas.push({
      id: 'ajustes',
      rotulo: 'Ajustes',
      conteudo: (
        <>
          {sincronizada && (
            <SincroniaLetra idMusica={musica.id} atrasoSalvo={atrasoSalvo} estimado={estimado} aoMudar={setAtrasoSalvo} />
          )}
          {urlFundo && <ControleDesfoque idMusica={musica.id} url={urlFundo} desfoque={desfoque} aoMudar={setDesfoque} />}
        </>
      ),
    })
  }

  // O que está diferente do normal, para ver mesmo com o painel fechado
  const lembretes = [
    velocidade !== 1 && `velocidade ${Math.round(velocidade * 100)}%`,
    metronomoLigado && 'metrônomo ligado',
    volumes.tocandoOriginal && 'original',
  ].filter(Boolean)

  return (
    <div
      className={`tela-musica ${tocando ? 'tela-musica--tocando' : ''}`}
      ref={conteiner}
      data-cores={paleta ? 'capa' : 'padrao'}
      style={paleta ? ({ '--roxo': paleta.forte, '--roxo-escuro': paleta.escuro, '--destaque': paleta.claro } as CSSProperties) : undefined}
    >
      <div className="tela-musica__brilho" aria-hidden />
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
        <Capa url={capaDaMusica(musica)} className="tela-musica__capa" />
        <div className="tela-musica__nome">
          <h1 title={nome === musica.titulo ? undefined : musica.titulo}>{nome}</h1>
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
            <Letra versos={versosNoTempo ?? versos} tempo={tempo} aoPular={player.pular} trechos={musica.trechos_voz} />
          ) : (
            <div className="tela-musica__sem-letra">
              <p>{erroLetra ?? 'Essa música ainda não tem letra.'}</p>
              <a href={LINK_INICIO}>Escolher a letra na tela inicial</a>
            </div>
          )}
        </section>

        <aside
          id="painel-controles"
          className="tela-musica__painel"
          aria-label="Controles"
          hidden={!painelAberto}
          onKeyDown={teclaNoPainel}
        >
          <Abas
            rotulo="Grupos de controles"
            abas={abas}
            inicial={abaInicial}
            aoTrocar={salvarAbaDaMusica}
            extra={
              <button
                type="button"
                className="botao botao--icone tela-musica__fechar"
                aria-label="Fechar os controles"
                title="Fechar (Esc)"
                onClick={fecharPainel}
              >
                <X size={18} aria-hidden />
              </button>
            }
          />
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
          <p className="texto-fraco tela-musica__lembretes" title={lembretes.join(' · ') || undefined}>
            {lembretes.join(' · ')}
          </p>
          <div className="tela-musica__transporte">
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
              className="botao botao--principal botao--vivo tela-musica__play"
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
          <button
            ref={botaoControles}
            type="button"
            className="botao tela-musica__alternar"
            aria-expanded={painelAberto}
            aria-controls="painel-controles"
            title={painelAberto ? 'Esconder os controles' : 'Mostrar volumes, treino e ajustes'}
            onClick={() => setPainelAberto(!painelAberto)}
          >
            <SlidersHorizontal size={18} aria-hidden />
            <span className="tela-musica__alternar-texto">Controles</span>
          </button>
        </div>
        <p className="texto-fraco tela-musica__aviso" role="status">
          {player.erro ?? (todasProntas ? '' : 'Carregando as faixas…')}
        </p>
        {/* Fora do painel: o aviso aparece mesmo com a gaveta fechada ou em outra aba */}
        {salvamento.erro && (
          <p className="erro tela-musica__aviso" role="alert">
            {salvamento.erro}
          </p>
        )}
      </section>

      {faixas.map((faixa, indice) => (
        <audio key={faixa.arquivo} src={urlDaFaixa(musica.id, faixa.arquivo)} {...player.propsDoAudio(indice)} />
      ))}
    </div>
  )
}
