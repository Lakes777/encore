import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { faixasParaCorrigir, indiceDoMestre } from './sincronia.ts'
import type { Faixa } from './tipos.ts'
import { aplicarVelocidade } from './velocidade.ts'

/**
 * Player de várias faixas tocando juntas, uma <audio> por faixa.
 *
 * Por que <audio> e não Web Audio (AudioBuffer)?
 *  - O <audio> lê o WAV aos poucos do servidor (a rota aceita Range): não precisa
 *    baixar e decodificar a música inteira na RAM, o que com 4+ faixas de WAV pesa.
 *  - Dá para mudar a velocidade sem mudar o tom com playbackRate + preservesPitch,
 *    que o navegador já faz. O tempo (currentTime) continua sendo o da música,
 *    então a letra e o resto seguem a velocidade sem conta nenhuma.
 * O preço é que cada <audio> tem seu próprio relógio. Por isso há um relógio mestre
 * (a primeira faixa que não é a original) e um laço que puxa as outras de volta
 * quando elas se afastam dele (regra em sincronia.ts).
 */
/** A faixa tem dados para seguir tocando e não está no meio de uma busca. */
export function carregado(audio: HTMLMediaElement) {
  return !audio.seeking && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
}

export function usePlayer(faixas: readonly Faixa[], duracaoConhecida: number | null, velocidade = 1) {
  const audios = useRef<(HTMLAudioElement | null)[]>([])
  const indiceMestre = indiceDoMestre(faixas)
  const [tocando, setTocando] = useState(false)
  const [tempo, setTempo] = useState(0)
  const [duracaoDoAudio, setDuracaoDoAudio] = useState<number | null>(null)
  const [prontas, setProntas] = useState<ReadonlySet<number>>(() => new Set())
  const [erro, setErro] = useState<string | null>(null)

  const duracao = duracaoDoAudio ?? duracaoConhecida ?? 0
  const todasProntas = faixas.length > 0 && prontas.size >= faixas.length

  const lista = () => audios.current.filter((audio): audio is HTMLAudioElement => audio != null)
  const mestre = () => audios.current[indiceMestre] ?? null

  // Enquanto toca: a cada quadro lê o tempo do mestre (a letra anda suave, não só
  // nos ~4 timeupdate por segundo) e corrige as faixas que se afastaram.
  useEffect(() => {
    if (!tocando) return
    let quadro = 0
    const passo = () => {
      const relogio = audios.current[indiceMestre]
      if (relogio) {
        const agora = relogio.currentTime
        setTempo(agora)
        // Faixa ainda buscando o trecho (depois de um pulo) fica de fora: mexer no
        // currentTime dela a cada quadro cancelaria a busca e ela ficaria muda.
        // Se é o mestre que está esperando dados, ninguém é corrigido neste quadro.
        const tempos = audios.current.map((audio) => (audio && carregado(audio) ? audio.currentTime : agora))
        if (!carregado(relogio)) tempos.fill(agora)
        for (const indice of faixasParaCorrigir(agora, tempos)) {
          const audio = audios.current[indice]
          if (audio) audio.currentTime = agora
        }
      }
      quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [tocando, indiceMestre])

  // Todas as faixas na mesma velocidade, senão a sincronia ficaria corrigindo o tempo todo
  useEffect(() => {
    for (const audio of audios.current) if (audio) aplicarVelocidade(audio, velocidade)
  }, [velocidade, faixas])

  // Saiu da tela: para tudo (o elemento some, mas melhor não depender disso).
  useEffect(() => {
    const elementos = audios.current
    return () => {
      for (const audio of elementos) audio?.pause()
    }
  }, [])

  function pausar() {
    for (const audio of lista()) audio.pause()
    setTocando(false)
    const relogio = mestre()
    if (relogio) setTempo(relogio.currentTime)
  }

  async function tocar() {
    const todas = lista()
    const relogio = mestre()
    if (!relogio) return
    for (const audio of todas) if (audio !== relogio) audio.currentTime = relogio.currentTime
    setErro(null)
    setTocando(true)
    try {
      await Promise.all(todas.map((audio) => audio.play()))
    } catch (motivo) {
      // AbortError: alguém pausou antes do play terminar; não é erro.
      if (motivo instanceof DOMException && motivo.name === 'AbortError') return
      for (const audio of todas) audio.pause()
      setTocando(false)
      setErro('O navegador não deixou tocar. Clique em tocar de novo.')
    }
  }

  function alternar() {
    if (tocando) pausar()
    else void tocar()
  }

  function pular(segundos: number) {
    const limite = duracao > 0 ? duracao : Number.POSITIVE_INFINITY
    const destino = Math.min(Math.max(0, segundos), limite)
    for (const audio of lista()) audio.currentTime = destino
    setTempo(destino)
  }

  /** Props de cada <audio>, na mesma ordem das faixas. */
  function propsDoAudio(indice: number) {
    const eMestre = indice === indiceMestre
    return {
      ref: (elemento: HTMLAudioElement | null) => {
        audios.current[indice] = elemento
      },
      preload: 'auto' as const,
      onCanPlay: () =>
        setProntas((antes) => {
          if (antes.has(indice)) return antes
          const depois = new Set(antes)
          depois.add(indice)
          return depois
        }),
      onError: () => setErro(`Não deu para carregar a faixa "${faixas[indice]?.nome}".`),
      onLoadedMetadata: eMestre
        ? (evento: SyntheticEvent<HTMLAudioElement>) => {
            const segundos = evento.currentTarget.duration
            if (Number.isFinite(segundos) && segundos > 0) setDuracaoDoAudio(segundos)
          }
        : undefined,
      onTimeUpdate: eMestre
        ? (evento: SyntheticEvent<HTMLAudioElement>) => setTempo(evento.currentTarget.currentTime)
        : undefined,
      // Terminou: volta ao início, parado.
      onEnded: eMestre
        ? () => {
            for (const audio of lista()) {
              audio.pause()
              audio.currentTime = 0
            }
            setTocando(false)
            setTempo(0)
          }
        : undefined,
    }
  }

  /** Tempo da música agora, direto do mestre (o `tempo` do estado só muda a cada quadro). */
  const tempoAgora = () => mestre()?.currentTime ?? 0

  return { audios, tocando, tempo, duracao, todasProntas, erro, tocar, pausar, alternar, pular, propsDoAudio, tempoAgora }
}
