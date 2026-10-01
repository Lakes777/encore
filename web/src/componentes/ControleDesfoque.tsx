import { useRef, useState } from 'react'
import { api, ErroApi } from '../logica/api.ts'
import { DESFOQUE_MAXIMO, type Fundo } from '../logica/tipos.ts'

interface Props {
  idMusica: string
  url: string
  desfoque: number
  /** Chamado a cada movimento, para o fundo mudar na hora. */
  aoMudar: (desfoque: number) => void
}

/** Desfoque da imagem de fundo. Só salva quando o usuário solta o controle. */
export function ControleDesfoque({ idMusica, url, desfoque, aoMudar }: Props) {
  const salvo = useRef(desfoque)
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'salvo'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (desfoque === salvo.current) return
    const fundo: Fundo = { url, desfoque }
    // Marca antes de mandar: soltar e depois tirar o foco não salva duas vezes.
    const anterior = salvo.current
    salvo.current = desfoque
    setEstado('salvando')
    setErro(null)
    try {
      await api.definirFundo(idMusica, fundo)
      setEstado('salvo')
    } catch (motivo) {
      salvo.current = anterior
      setEstado('parado')
      setErro(motivo instanceof ErroApi ? motivo.message : 'Não deu para salvar o desfoque.')
    }
  }

  return (
    <div className="desfoque">
      <label className="desfoque__rotulo">
        <span>Desfoque do fundo</span>
        <input
          type="range"
          min={0}
          max={DESFOQUE_MAXIMO}
          step={1}
          value={desfoque}
          aria-valuetext={`${desfoque} pixels`}
          onChange={(evento) => aoMudar(Number(evento.target.value))}
          // Soltar o mouse/dedo ou a tecla: aí sim salva.
          onPointerUp={() => void salvar()}
          onKeyUp={() => void salvar()}
          onBlur={() => void salvar()}
        />
      </label>
      <span className="texto-fraco" role="status">
        {estado === 'salvando' ? 'Salvando…' : estado === 'salvo' ? 'Salvo' : ''}
      </span>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </div>
  )
}
