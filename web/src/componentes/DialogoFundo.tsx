import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../logica/api.ts'
import { nomeDaMusica } from '../logica/formatar.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import { DESFOQUE_MAXIMO, DESFOQUE_PADRAO, type Capa, type Musica } from '../logica/tipos.ts'
import { Dialogo } from './Dialogo.tsx'

interface Props {
  musica: Musica
  aoFechar: () => void
  /** Chamado depois de salvar, para recarregar a lista. */
  aoMudar: () => void
}

/** Escolhe a imagem de fundo da tela da música: uma capa do iTunes, um link colado ou nenhuma. */
export function DialogoFundo({ musica, aoFechar, aoMudar }: Props) {
  const [capas, setCapas] = useState<Capa[] | null>(null)
  const [erroCapas, setErroCapas] = useState('')
  const [url, setUrl] = useState<string | null>(musica.fundo?.url ?? null)
  // Começa com a imagem atual; escolher uma capa limpa o campo.
  const [link, setLink] = useState(musica.fundo?.url ?? '')
  const [desfoque, setDesfoque] = useState(musica.fundo?.desfoque ?? DESFOQUE_PADRAO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true
    api
      .capas(musica.id)
      .then((lista) => ativo && setCapas(lista))
      .catch((falha) => ativo && setErroCapas(mensagemDoErro(falha)))
    return () => {
      ativo = false
    }
  }, [musica.id])

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (url && !url.startsWith('https://')) {
      setErro('O link da imagem precisa começar com https://.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await api.definirFundo(musica.id, { url, desfoque })
      aoMudar()
      aoFechar()
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      setSalvando(false)
    }
  }

  return (
    <Dialogo titulo={`Fundo de ${nomeDaMusica(musica)}`} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="fundo">
        {!capas && !erroCapas && (
          <p className="texto-fraco" role="status">
            Procurando capas...
          </p>
        )}
        {erroCapas && <p className="erro" role="alert">{erroCapas}</p>}
        {capas && capas.length === 0 && <p className="texto-fraco">Nenhuma capa encontrada no iTunes.</p>}
        {capas && capas.length > 0 && (
          <div className="fundo__capas" role="group" aria-label="Capas">
            {capas.map((capa) => (
              <button
                key={capa.url}
                type="button"
                className="fundo__capa"
                aria-pressed={url === capa.url}
                aria-label={`Capa de ${capa.album}`}
                title={`${capa.album} (${capa.artista})`}
                onClick={() => {
                  setUrl(capa.url)
                  setLink('')
                }}
              >
                <img src={capa.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <label className="fundo__campo">
          <span>Ou cole o link de uma imagem (https://)</span>
          <input
            className="campo"
            type="url"
            inputMode="url"
            placeholder="https://..."
            value={link}
            onChange={(evento) => {
              setLink(evento.target.value)
              setUrl(evento.target.value.trim() || null)
            }}
          />
        </label>

        <label className="fundo__sem-imagem">
          <input
            type="checkbox"
            checked={url === null}
            onChange={(evento) => {
              if (evento.target.checked) {
                setUrl(null)
                setLink('')
              }
            }}
          />
          Sem imagem
        </label>

        <label className="fundo__campo">
          <span>
            Desfoque: {desfoque} px
          </span>
          <input
            type="range"
            min={0}
            max={DESFOQUE_MAXIMO}
            step={1}
            value={desfoque}
            onChange={(evento) => setDesfoque(Number(evento.target.value))}
          />
        </label>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <div className="fundo__acoes">
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao--principal" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}
