import { X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../logica/api.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { nomeDoModo, rodando, TEXTO_DO_ESTADO } from '../logica/fila.ts'
import type { Sistema, Tarefa } from '../logica/tipos.ts'
import { miniaturaDoVideo } from '../logica/youtube.ts'
import { Capa } from './Capa.tsx'

interface Props {
  tarefas: Tarefa[]
  sistema: Sistema | null
  /** Chamado com o id da tarefa que saiu da fila. */
  aoRemover: (id: string) => void
  /** Chamado com o id da tarefa que pode estar parando: a próxima consulta à fila diz se ela já sumiu. */
  aoCancelar: (id: string) => void
}

export function Fila({ tarefas, sistema, aoRemover, aoCancelar }: Props) {
  const [erro, setErro] = useState('')

  async function remover(tarefa: Tarefa) {
    const cancelar = rodando(tarefa.estado)
    if (cancelar && !window.confirm(`Cancelar "${tarefa.titulo}"? O que já foi baixado ou separado será apagado.`)) return
    setErro('')
    try {
      await api.esquecerTarefa(tarefa.id)
      // A tela pode estar atrasada: "na fila" aqui e já baixando no servidor (que então cancela).
      // Só some na hora o que com certeza já tinha terminado; o resto fica até a consulta.
      if (tarefa.estado === 'pronta' || tarefa.estado === 'erro') aoRemover(tarefa.id)
      else aoCancelar(tarefa.id)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    }
  }

  return (
    <section className="secao" aria-labelledby="titulo-fila">
      <h2 id="titulo-fila">Fila</h2>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <ul className="lista">
        {tarefas.map((tarefa) => {
          const porcento = Math.round(Math.min(1, Math.max(0, tarefa.progresso)) * 100)
          return (
            <li key={tarefa.id} className={`cartao tarefa tarefa--${tarefa.estado === 'na fila' ? 'na-fila' : tarefa.estado}`}>
              <div className="tarefa__topo">
                <Capa url={miniaturaDoVideo(tarefa.id_video)} className="tarefa__capa" />
                <div className="tarefa__texto">
                  <h3 className="tarefa__titulo">{tarefa.titulo}</h3>
                  <p className="texto-fraco">
                    <span className="tarefa__estado">{TEXTO_DO_ESTADO[tarefa.estado]}</span> · {porcento}% · {nomeDoModo(tarefa.modo, sistema)}
                  </p>
                </div>
                {tarefa.estado !== 'cancelando' && (
                  <button
                    type="button"
                    className="botao botao--icone botao--perigo"
                    aria-label={rodando(tarefa.estado) ? `Cancelar ${tarefa.titulo}` : `Tirar ${tarefa.titulo} da fila`}
                    title={rodando(tarefa.estado) ? 'Cancelar' : 'Tirar da fila'}
                    onClick={() => remover(tarefa)}
                  >
                    <X size={18} aria-hidden />
                  </button>
                )}
              </div>
              <div
                className="progresso"
                role="progressbar"
                aria-label={`Progresso de ${tarefa.titulo}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={porcento}
              >
                <div className="progresso__barra" style={{ width: `${porcento}%` }} />
              </div>
              {tarefa.estado === 'erro' && tarefa.erro && <p className="erro">{tarefa.erro}</p>}
              {tarefa.aviso && <p className="aviso">{tarefa.aviso}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
