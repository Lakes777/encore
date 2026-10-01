import { useEffect, useRef, useState } from 'react'
import { api } from './api.ts'
import { mensagemDoErro } from './mensagem.ts'
import type { Faixa } from './tipos.ts'
import { eOriginal } from './volumes.ts'

/** Espera o usuário parar de mexer nos controles antes de salvar. */
export const ESPERA_PARA_SALVAR = 700

/**
 * Volumes que mudaram em relação ao que está salvo. A original fica de fora: o
 * "tocar a original" é só da hora, e ela continua salva com volume 0.
 */
export function volumesMudados(faixas: readonly Faixa[], atuais: Record<string, number>, salvos: Record<string, number>) {
  const mudados: Record<string, number> = {}
  for (const faixa of faixas) {
    if (eOriginal(faixa)) continue
    const volume = atuais[faixa.arquivo]
    if (volume !== undefined && volume !== salvos[faixa.arquivo]) mudados[faixa.arquivo] = volume
  }
  return mudados
}

/**
 * Salva sozinho os volumes da música, um pouco depois da última mudança.
 * O mudo não é salvo (é um botão da hora); para deixar uma faixa sempre
 * desligada, é só pôr o controle no zero.
 */
export function useSalvarVolumes(idMusica: string, faixas: readonly Faixa[], volumes: Record<string, number>) {
  const salvos = useRef<Record<string, number>>(Object.fromEntries(faixas.map((f) => [f.arquivo, f.volume])))
  const pendentes = useRef<Record<string, number>>({})
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'salvo'>('parado')
  const [erro, setErro] = useState('')

  useEffect(() => {
    const mudados = volumesMudados(faixas, volumes, salvos.current)
    pendentes.current = mudados
    if (Object.keys(mudados).length === 0) return
    const espera = window.setTimeout(() => {
      pendentes.current = {}
      // Marca antes de mandar: a mesma mudança não sai duas vezes
      const anteriores = { ...salvos.current }
      Object.assign(salvos.current, mudados)
      setEstado('salvando')
      setErro('')
      api.definirVolumes(idMusica, mudados).then(
        () => setEstado('salvo'),
        (motivo) => {
          // Volta só o que ainda é desta tentativa, para tentar de novo na próxima mudança
          for (const arquivo of Object.keys(mudados)) {
            if (salvos.current[arquivo] === mudados[arquivo]) salvos.current[arquivo] = anteriores[arquivo]
          }
          setEstado('parado')
          setErro(`Não deu para salvar os volumes: ${mensagemDoErro(motivo)}`)
        },
      )
    }, ESPERA_PARA_SALVAR)
    return () => window.clearTimeout(espera)
  }, [idMusica, faixas, volumes])

  // Saiu da tela antes da espera acabar: salva o que faltava mesmo assim.
  useEffect(
    () => () => {
      if (Object.keys(pendentes.current).length > 0) void api.definirVolumes(idMusica, pendentes.current).catch(() => {})
    },
    [idMusica],
  )

  return { estado, erro }
}
