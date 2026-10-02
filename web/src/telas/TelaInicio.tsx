import { Mic } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Busca } from '../componentes/Busca.tsx'
import { Fila } from '../componentes/Fila.tsx'
import { MinhasMusicas } from '../componentes/MinhasMusicas.tsx'
import { api } from '../logica/api.ts'
import { emAndamento } from '../logica/fila.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { LINK_DA_ABA, LINK_LOBBY, type AbaInicio } from '../logica/rota.ts'
import type { EstadoTarefa, Musica, Sistema, Tarefa } from '../logica/tipos.ts'
import { TelaLobby } from './TelaLobby.tsx'
import './TelaInicio.css'

/** De quanto em quanto tempo a fila é consultada enquanto alguma tarefa anda. */
export const INTERVALO_DA_FILA = 1500

/** Quanto dura o fade de saída da aba antes da próxima entrar (o mesmo .aba-tela--saindo do CSS). */
export const SAIDA_DA_ABA = 150

const ABAS: { id: AbaInicio; rotulo: string }[] = [
  { id: 'lobby', rotulo: 'Início' },
  { id: 'musicas', rotulo: 'Minhas músicas' },
  { id: 'buscar', rotulo: 'Buscar' },
  { id: 'fila', rotulo: 'Fila' },
]

interface Props {
  /** Aba aberta (vem do endereço: #/, #/musicas, #/buscar ou #/fila). */
  aba?: AbaInicio
}

/**
 * Tela inicial em abas: a apresentação (lobby), as músicas prontas, a busca no YouTube
 * e a fila de preparo. O cabeçalho e o menu ficam parados; só o conteúdo troca.
 * As abas ficam montadas (só escondidas), então a busca e a prévia não se perdem ao trocar.
 */
export function TelaInicio({ aba = 'musicas' }: Props) {
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

  // Troca de aba: a anterior some num fade rápido e só então a nova entra
  const [abaExibida, setAbaExibida] = useState(aba)
  const trocando = aba !== abaExibida
  const abaComFoco = useRef(aba)
  const paineis = useRef(new Map<AbaInicio, HTMLElement>())
  useEffect(() => {
    if (!trocando) return
    const espera = window.setTimeout(() => {
      setAbaExibida(aba)
      // A prévia não continua tocando escondida em outra aba
      setPreviaAberta(null)
    }, SAIDA_DA_ABA)
    return () => window.clearTimeout(espera)
  }, [trocando, aba])

  // Na aba nova, o foco vai para o título dela (o leitor de tela anuncia onde está)
  // (não ao abrir a página: só quando a aba muda)
  useEffect(() => {
    if (abaComFoco.current === abaExibida) return
    abaComFoco.current = abaExibida
    const titulo = paineis.current.get(abaExibida)?.querySelector<HTMLElement>('h1, h2')
    if (!titulo) return
    titulo.tabIndex = -1
    titulo.focus({ preventScroll: true })
  }, [abaExibida])

  // Pílula que desliza até a aba escolhida (medida no layout, como na Lista de Animes)
  const menu = useRef<HTMLElement>(null)
  const [pilula, setPilula] = useState<{ x: number; largura: number; animar: boolean } | null>(null)
  const pilulaMedida = useRef(false)
  const abaDaPilula = useRef(aba)
  const medirPilula = useCallback((animar: boolean) => {
    const link = menu.current?.querySelector<HTMLElement>(`[data-aba="${abaDaPilula.current}"]`)
    if (!link) return
    setPilula({ x: link.offsetLeft, largura: link.offsetWidth, animar })
    pilulaMedida.current = true
  }, [])
  useLayoutEffect(() => {
    abaDaPilula.current = aba
    // Na primeira medida a pílula já nasce no lugar; depois desliza
    medirPilula(pilulaMedida.current)
  }, [aba, medirPilula])
  // Mede de novo, sem deslizar, quando a janela muda ou um link muda de largura
  // (o contador da Fila aparece, a fonte termina de carregar)
  useEffect(() => {
    const aoRedimensionar = () => medirPilula(false)
    window.addEventListener('resize', aoRedimensionar)
    let observador: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && menu.current) {
      observador = new ResizeObserver(aoRedimensionar)
      for (const link of menu.current.querySelectorAll('a')) observador.observe(link)
    }
    return () => {
      window.removeEventListener('resize', aoRedimensionar)
      observador?.disconnect()
    }
  }, [medirPilula])

  // O contador da Fila pula quando entra uma música nova
  const naFila = tarefas.filter((t) => emAndamento(t.estado)).length
  const [pulos, setPulos] = useState(0)
  const naFilaAntes = useRef(naFila)
  useEffect(() => {
    if (naFila > naFilaAntes.current) setPulos((n) => n + 1)
    naFilaAntes.current = naFila
  }, [naFila])

  function painel(id: AbaInicio, conteudo: ReactNode) {
    const visivel = id === abaExibida
    return (
      <div
        ref={(elemento) => {
          if (elemento) paineis.current.set(id, elemento)
          else paineis.current.delete(id)
        }}
        id={`aba-${id}`}
        className={`aba-tela ${visivel && trocando ? 'aba-tela--saindo' : 'aba-tela--entrando'}`}
        hidden={!visivel}
      >
        {conteudo}
      </div>
    )
  }

  const TituloDoTopo = abaExibida === 'lobby' ? 'p' : 'h1'

  return (
    <main className="pagina inicio">
      <div className="inicio__cabeca">
        <header className="inicio__topo">
          {/* O logo e o nome levam de volta ao lobby (o logo fica fora do Tab: o nome já é o link) */}
          <a className="inicio__logo" href={LINK_LOBBY} tabIndex={-1} aria-hidden>
            <Mic size={22} aria-hidden />
          </a>
          <div>
            {/* Um h1 só por tela: no lobby o h1 é o título grande dele */}
            <TituloDoTopo className="inicio__titulo">
              <a className="inicio__marca" href={LINK_LOBBY} title="Voltar para a apresentação">
                Karaokê
              </a>
            </TituloDoTopo>
            <p className="texto-fraco inicio__lema">Busque uma música, tire a voz e cante por cima.</p>
          </div>
        </header>
        <nav className="menu" aria-label="Seções" ref={menu}>
          {pilula && (
            <span
              className={`menu__pilula ${pilula.animar ? 'menu__pilula--anima' : ''}`}
              style={{ width: pilula.largura, transform: `translateX(${pilula.x}px)` }}
              aria-hidden
            />
          )}
          {ABAS.map(({ id, rotulo }) => (
            <a
              key={id}
              href={LINK_DA_ABA[id]}
              data-aba={id}
              className={`menu__link ${id === aba ? 'menu__link--ativo' : ''}`}
              aria-current={id === aba ? 'page' : undefined}
              aria-label={id === 'fila' && naFila > 0 ? `Fila, ${naFila} em preparo` : undefined}
            >
              {rotulo}
              {id === 'fila' && naFila > 0 && (
                <span key={pulos} className="menu__contador" aria-hidden>
                  {naFila}
                </span>
              )}
            </a>
          ))}
        </nav>
      </div>
      {/* Erros de rede fora das abas: um alerta numa aba escondida não seria anunciado */}
      {[erroSistema, erroMusicas, erroFila].map(
        (erro, indice) =>
          erro && (
            <p key={indice} className="erro" role="alert">
              {erro}
            </p>
          ),
      )}

      {painel('lobby', <TelaLobby prontas={musicas ? musicas.length : null} />)}

      {painel(
        'musicas',
        <MinhasMusicas
          musicas={musicas}
          erro={erroMusicas}
          aoMudar={carregarMusicas}
          previaAberta={previaAberta}
          abrirPrevia={setPreviaAberta}
        />,
      )}

      {painel(
        'buscar',
        <Busca
          sistema={sistema}
          videosNaFila={videosNaFila}
          aoAdicionar={aoAdicionar}
          previaAberta={previaAberta}
          abrirPrevia={setPreviaAberta}
        />,
      )}

      {painel(
        'fila',
        <Fila tarefas={tarefas} sistema={sistema} aoRemover={aoRemover} aoCancelar={aoCancelar} />,
      )}
    </main>
  )
}
