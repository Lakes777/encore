import { useEffect, useEffectEvent, useRef } from 'react'
import { batidasParaAgendar, JANELA_DO_METRONOMO } from './metronomo.ts'

interface Opcoes {
  batidas: readonly number[]
  ligado: boolean
  tocando: boolean
  /** 0 a 1. */
  volume: number
  velocidade: number
  /** Tempo da música agora (lido do <audio> mestre, não do estado do React). */
  tempoDaMusica: () => number
}

/** Toca um clique curto em cada batida enquanto a música toca e o metrônomo está ligado. */
export function useMetronomo({ batidas, ligado, tocando, volume, velocidade, tempoDaMusica }: Opcoes) {
  const contexto = useRef<AudioContext | null>(null)
  // Lido a cada passo, sempre com os valores mais novos, sem reiniciar o agendamento
  const agora = useEffectEvent(() => ({ volume, velocidade, tempo: tempoDaMusica() }))

  useEffect(() => {
    if (!ligado || !tocando || batidas.length === 0 || typeof AudioContext === 'undefined') return
    contexto.current ??= new AudioContext()
    const audio = contexto.current
    void audio.resume()
    let proxima = -1
    const agendados = new Set<OscillatorNode>()

    const passo = () => {
      const { velocidade: vel, volume: vol, tempo } = agora()
      // A janela é em tempo de relógio; em tempo de música ela anda `vel` vezes mais rápido
      const resultado = batidasParaAgendar(batidas, tempo, JANELA_DO_METRONOMO * vel, proxima)
      proxima = resultado.proxima
      if (resultado.pulou) {
        for (const oscilador of agendados) oscilador.stop()
        agendados.clear()
      }
      for (const { daquiA } of resultado.agendar) {
        const oscilador = clique(audio, audio.currentTime + daquiA / vel, vol)
        agendados.add(oscilador)
        oscilador.onended = () => agendados.delete(oscilador)
      }
    }
    passo()
    const intervalo = window.setInterval(passo, 25)
    return () => {
      window.clearInterval(intervalo)
      // Pausou ou desligou: os cliques já agendados (até 0,15 s à frente) não tocam
      for (const oscilador of agendados) oscilador.stop()
    }
  }, [ligado, tocando, batidas])

  useEffect(() => () => void contexto.current?.close(), [])
}

function clique(audio: AudioContext, quando: number, volume: number) {
  const oscilador = audio.createOscillator()
  const ganho = audio.createGain()
  oscilador.frequency.value = 1500
  // Ataque rápido e queda em 40 ms: um "tic" seco, que não briga com a música
  ganho.gain.setValueAtTime(0.0001, quando)
  ganho.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), quando + 0.002)
  ganho.gain.exponentialRampToValueAtTime(0.0001, quando + 0.04)
  oscilador.connect(ganho).connect(audio.destination)
  oscilador.start(quando)
  oscilador.stop(quando + 0.05)
  return oscilador
}
