import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Busca } from '../componentes/Busca.tsx'
import { Fila } from '../componentes/Fila.tsx'
import { MinhasMusicas } from '../componentes/MinhasMusicas.tsx'
import { api } from '../logica/api.ts'
import { emAndamento } from '../logica/fila.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import type { EstadoTarefa, Musica, Sistema, Tarefa } from '../logica/tipos.ts'
import './TelaInicio.css'

/** De quanto em quanto tempo a fila é consultada enquanto alguma tarefa anda. */
export const INTERVALO_DA_FILA = 1500

/** Tela inicial: busca no YouTube, fila de separação e a lista de músicas prontas. */
export function TelaInicio() {
  const [sistema, setSistema] = useState<Sistema | null>(null)
  const [erroSistema, setErroSistema] = useState('')
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [erroFila, setErroFila] = useState('')
  const [musicas, setMusicas] = useState<Musica[] | null>(null)
  const [erroMusicas, setErroMusicas] = useState('')
  // Só uma prévia tocando na tela inteira: "busca:ID_DO_VIDEO" ou "musica:ID".
  const [previaAberta, setPreviaAberta] = useState<string | null>(null)

  // Último estado visto de cada tarefa, para notar quando uma acaba de ficar pronta.
  const estadosVistos = useRef(new Map<string, EstadoTarefa>())
  // Número do último pedido da fila: se o servidor demorar e as respostas chegarem
  // fora de ordem, só a mais nova vale.
  const ultimoPedidoFila = useRef(0)

  const carregarMusicas = useCallback(
    () =>
      api.musicas().then(
        (lista) => {
          setMusicas(lista)
          setErroMusicas('')
        },
        (falha) => setErroMusicas(mensagemDoErro(falha)),
      ),
    [],
  )

  // Em .then (e não async/await) para o oxlint não confundir com setState síncrono no efeito.
  const carregarFila = useCallback(() => {
    const pedido = ++ultimoPedidoFila.current
    return api.fila().then(
      (lista) => {
        if (pedido !== ultimoPedidoFila.current) return
        const anteriores = estadosVistos.current
        const ficouPronta = lista.some((t) => t.estado === 'pronta' && anteriores.has(t.id) && anteriores.get(t.id) !== 'pronta')
        estadosVistos.current = new Map(lista.map((t) => [t.id, t.estado]))
        setTarefas(lista)
        setErroFila('')
        if (ficouPronta) void carregarMusicas()
      },
      (falha) => {
        if (pedido === ultimoPedidoFila.current) setErroFila(mensagemDoErro(falha))
      },
    )
  }, [carregarMusicas])

  useEffect(() => {
    let ativo = true
    api
      .sistema()
      .then((dados) => ativo && setSistema(dados))
      .catch((falha) => ativo && setErroSistema(mensagemDoErro(falha)))
    void carregarFila()
    void carregarMusicas()
    return () => {
      ativo = false
    }
  }, [carregarFila, carregarMusicas])

  // Consulta a fila de tempos em tempos só enquanto alguma tarefa está andando.
  const temTarefaAndando = tarefas.some((t) => emAndamento(t.estado))
  useEffect(() => {
    if (!temTarefaAndando) return
    // setTimeout encadeado, e não setInterval: a próxima consulta só sai quando a
    // anterior volta. Com a CPU ocupada separando, o servidor pode levar mais que o
    // intervalo para responder, e consultas sobrepostas descartariam umas às outras.
    let ativo = true
    let espera = 0
    const agendar = () => {
      espera = window.setTimeout(() => {
        void carregarFila().finally(() => {
          if (ativo) agendar()
        })
      }, INTERVALO_DA_FILA)
    }
    agendar()
    return () => {
      ativo = false
      window.clearTimeout(espera)
    }
  }, [temTarefaAndando, carregarFila])

  const videosNaFila = useMemo(() => new Set(tarefas.filter((t) => t.estado !== 'erro').map((t) => t.id_video)), [tarefas])

  function aoAdicionar(tarefa: Tarefa) {
    // Já entra na lista, sem esperar a próxima consulta; e conta como "visto" para
    // a lista de músicas recarregar quando ela ficar pronta.
    estadosVistos.current.set(tarefa.id, tarefa.estado)
    setTarefas((atuais) => (atuais.some((t) => t.id === tarefa.id) ? atuais : [...atuais, tarefa]))
    void carregarFila()
  }

  function aoRemover(id: string) {
    setTarefas((atuais) => atuais.filter((t) => t.id !== id))
    void carregarFila()
  }

  function aoCancelar() {
    void carregarFila()
  }

  return (
    <main className="pagina inicio">
      <h1 className="inicio__titulo">Karaokê</h1>
      {erroSistema && (
        <p className="erro" role="alert">
          {erroSistema}
        </p>
      )}

      <Busca
        sistema={sistema}
        videosNaFila={videosNaFila}
        aoAdicionar={aoAdicionar}
        previaAberta={previaAberta}
        abrirPrevia={setPreviaAberta}
      />

      {erroFila && (
        <p className="erro" role="alert">
          {erroFila}
        </p>
      )}
      {tarefas.length > 0 && <Fila tarefas={tarefas} sistema={sistema} aoRemover={aoRemover} aoCancelar={aoCancelar} />}

      <MinhasMusicas
        musicas={musicas}
        erro={erroMusicas}
        aoMudar={carregarMusicas}
        previaAberta={previaAberta}
        abrirPrevia={setPreviaAberta}
      />
    </main>
  )
}
