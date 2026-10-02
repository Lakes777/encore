import { Check, Play, Plus, Search } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { api, urlDaPrevia } from '../logica/api.ts'
import { formatarDuracao, formatarEstimativa } from '../logica/formatar.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { nomeDoModo } from '../logica/fila.ts'
import type { NomeModo, ResultadoBusca, Sistema, Tarefa } from '../logica/tipos.ts'
import { artistaDoCanal } from '../logica/youtube.ts'
import { Previa } from './Previa.tsx'

export const AVISO_ALTA_NA_CPU = 'Sem placa de vídeo, o modo Alta fica muito lento.'
export const AVISO_CLIPE =
  'Videoclipe: pode ter introdução ou cenas a mais, e aí a letra e a versão pronta saem do tempo. Prefira o áudio da música.'

interface Props {
  sistema: Sistema | null
  /** Vídeos que já estão na fila (para o resultado mostrar "Na fila"). */
  videosNaFila: ReadonlySet<string>
  aoAdicionar: (tarefa: Tarefa) => void
  /** Chave da prévia aberta na tela (só uma por vez). */
  previaAberta: string | null
  abrirPrevia: (chave: string | null) => void
}

export function Busca({ sistema, videosNaFila, aoAdicionar, previaAberta, abrirPrevia }: Props) {
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null)
  // Conta as buscas: a resposta de uma busca antiga (ou apagada) não aparece mais
  const ultimaBusca = useRef(0)

  async function buscar(evento: FormEvent) {
    evento.preventDefault()
    const pedido = texto.trim()
    if (!pedido || carregando) return
    const numero = ++ultimaBusca.current
    setCarregando(true)
    setErro('')
    try {
      const achados = await api.buscar(pedido)
      if (numero === ultimaBusca.current) setResultados(achados)
    } catch (falha) {
      if (numero === ultimaBusca.current) {
        setErro(mensagemDoErro(falha))
        setResultados(null)
      }
    } finally {
      if (numero === ultimaBusca.current) setCarregando(false)
    }
  }

  function mudarTexto(novo: string) {
    setTexto(novo)
    if (novo.trim()) return
    // Campo apagado (ou o "x" do campo de busca): some com os resultados e a prévia deles
    ultimaBusca.current++
    setResultados(null)
    setErro('')
    setCarregando(false)
    if (previaAberta?.startsWith('busca:')) abrirPrevia(null)
  }

  return (
    <section className="secao" aria-labelledby="titulo-busca">
      <h2 id="titulo-busca">Buscar</h2>
      <form className="busca__form" onSubmit={buscar} role="search">
        <label htmlFor="campo-busca" className="invisivel">
          Nome da música ou link do YouTube
        </label>
        <input
          id="campo-busca"
          className="campo busca__campo"
          type="search"
          placeholder="nome da música ou link do YouTube"
          value={texto}
          onChange={(evento) => mudarTexto(evento.target.value)}
        />
        <button type="submit" className="botao botao--principal" disabled={carregando || !texto.trim()}>
          <Search size={16} aria-hidden />
          Buscar
        </button>
      </form>

      {carregando && <p className="texto-fraco" role="status">Buscando…</p>}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {resultados && resultados.length === 0 && !carregando && <p className="texto-fraco">Nada encontrado.</p>}

      {resultados && resultados.length > 0 && (
        <ul className="lista" aria-label="Resultados da busca">
          {resultados.map((resultado) => (
            <ItemResultado
              key={resultado.id}
              resultado={resultado}
              sistema={sistema}
              naFila={videosNaFila.has(resultado.id)}
              aoAdicionar={aoAdicionar}
              previaAberta={previaAberta === `busca:${resultado.id}`}
              abrirPrevia={(aberta) => abrirPrevia(aberta ? `busca:${resultado.id}` : null)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

interface PropsItem {
  resultado: ResultadoBusca
  sistema: Sistema | null
  naFila: boolean
  aoAdicionar: (tarefa: Tarefa) => void
  previaAberta: boolean
  abrirPrevia: (aberta: boolean) => void
}

function ItemResultado({ resultado, sistema, naFila, aoAdicionar, previaAberta, abrirPrevia }: PropsItem) {
  const [modoEscolhido, setModoEscolhido] = useState<NomeModo | null>(null)
  const [adicionando, setAdicionando] = useState(false)
  const [erro, setErro] = useState('')
  // Padrão: a versão pronta (quando acha, leva 1-2 min em vez de vários). Até o
  // /api/sistema responder, não há modo e o backend usa o padrão dele.
  const modo = modoEscolhido ?? (sistema?.modos.some((m) => m.nome === 'pronta') ? 'pronta' : sistema?.modo_padrao)
  // Só pela fila: se a tarefa der erro ou for removida, o botão Adicionar volta.
  const estaNaFila = naFila

  async function adicionar() {
    setAdicionando(true)
    setErro('')
    try {
      const tarefa = await api.adicionarNaFila({
        id_video: resultado.id,
        titulo: resultado.titulo,
        artista: artistaDoCanal(resultado.canal),
        modo,
        duracao: resultado.duracao,
      })
      aoAdicionar(tarefa)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setAdicionando(false)
    }
  }

  return (
    <li className="cartao resultado">
      <div className="resultado__linha">
        {resultado.miniatura ? (
          <img className="resultado__miniatura" src={resultado.miniatura} alt="" loading="lazy" />
        ) : (
          <div className="resultado__miniatura" aria-hidden />
        )}
        <div className="resultado__texto">
          <h3 className="resultado__titulo">{resultado.titulo}</h3>
          <p className="texto-fraco">
            {resultado.canal} · {formatarDuracao(resultado.duracao)}
            {resultado.tipo === 'audio' && ' · áudio da música'}
          </p>
          {resultado.tipo === 'clipe' && (
            <p className="aviso" title='Áudio da música: "Official Audio", "Lyrics" ou canal "Topic"'>
              {AVISO_CLIPE}
            </p>
          )}
        </div>
      </div>

      {sistema && sistema.modos.length > 0 && (
        <fieldset className="resultado__modos">
          <legend className="texto-fraco">Qualidade</legend>
          {sistema.modos.map((opcao) => (
            <label key={opcao.nome} className="resultado__modo">
              <input
                type="radio"
                name={`modo-${resultado.id}`}
                value={opcao.nome}
                checked={modo === opcao.nome}
                onChange={() => setModoEscolhido(opcao.nome)}
                disabled={estaNaFila}
              />
              {opcao.descricao}
              <span className="texto-fraco">
                {/* A versão pronta para de procurar quando acha uma boa: a estimativa é o pior caso */}
                {opcao.nome === 'pronta' && resultado.estimativas.pronta != null ? 'até ' : ''}
                {formatarEstimativa(resultado.estimativas[opcao.nome])}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {modo === 'pronta' && sistema && !estaNaFila && (
        <p className="texto-fraco">
          Procura um instrumental pronto no YouTube; se nenhum servir, separa com IA (
          {nomeDoModo(sistema.modo_reserva, sistema)}), o que soma o tempo da separação.
        </p>
      )}
      {modo === 'qualidade' && sistema?.dispositivo === 'cpu' && !estaNaFila && (
        <p className="aviso">{AVISO_ALTA_NA_CPU}</p>
      )}

      <div className="resultado__acoes">
        <button type="button" className="botao" onClick={() => abrirPrevia(!previaAberta)} aria-expanded={previaAberta}>
          <Play size={16} aria-hidden />
          Prévia
        </button>
        {estaNaFila ? (
          <span className="resultado__na-fila">
            <Check size={16} aria-hidden />
            Na fila
          </span>
        ) : (
          <button type="button" className="botao botao--principal" onClick={adicionar} disabled={adicionando}>
            <Plus size={16} aria-hidden />
            {adicionando ? 'Adicionando…' : 'Adicionar'}
          </button>
        )}
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {previaAberta && (
        <Previa
          url={urlDaPrevia(resultado.id)}
          idVideo={resultado.id}
          inicio={resultado.inicio_previa}
          titulo={resultado.titulo}
          aoFechar={() => abrirPrevia(false)}
        />
      )}
    </li>
  )
}
