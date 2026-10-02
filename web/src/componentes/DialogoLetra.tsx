import { useEffect, useState } from 'react'
import { api } from '../logica/api.ts'
import { formatarDuracao, nomeDaMusica } from '../logica/formatar.ts'
import { mensagemDoErro } from '../logica/mensagem.ts'
import type { Musica, VersaoLetra } from '../logica/tipos.ts'
import { Dialogo } from './Dialogo.tsx'

interface Props {
  musica: Musica
  aoFechar: () => void
  /** Chamado depois de trocar ou tirar a letra, para recarregar a lista. */
  aoMudar: () => void
}

/** "+2 s", "-3 s", "0 s": quanto a versão da letra é mais longa ou mais curta que a música. */
function textoDaDiferenca(diferenca: number) {
  const inteiro = Math.round(diferenca)
  return `${inteiro > 0 ? '+' : ''}${inteiro} s`
}

/** Lista as versões da letra no LRCLIB para escolher uma (ou tirar a que está). */
export function DialogoLetra({ musica, aoFechar, aoMudar }: Props) {
  const [versoes, setVersoes] = useState<VersaoLetra[] | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true
    api
      .versoesDaLetra(musica.id)
      .then((lista) => ativo && setVersoes(lista))
      .catch((falha) => ativo && setErro(mensagemDoErro(falha)))
    return () => {
      ativo = false
    }
  }, [musica.id])

  async function salvar(acao: () => Promise<unknown>) {
    setSalvando(true)
    setErro('')
    try {
      await acao()
      aoMudar()
      aoFechar()
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      setSalvando(false)
    }
  }

  return (
    <Dialogo titulo={`Letra de ${nomeDaMusica(musica)}`} aoFechar={aoFechar}>
      {musica.tem_letra && (
        <p>
          <button type="button" className="botao botao--perigo" disabled={salvando} onClick={() => salvar(() => api.apagarLetra(musica.id))}>
            Tirar a letra
          </button>
        </p>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {!versoes && !erro && (
        <p className="texto-fraco" role="status">
          Procurando letras...
        </p>
      )}
      {versoes && versoes.length === 0 && <p className="texto-fraco">Nenhuma letra encontrada no LRCLIB.</p>}
      {versoes && versoes.length > 0 && (
        <ul className="lista" aria-label="Versões da letra">
          {versoes.map((versao) => {
            const emUso = musica.tem_letra && musica.letra_id === versao.id
            const detalhes = [
              versao.album,
              formatarDuracao(versao.duracao),
              versao.sincronizada ? 'sincronizada' : 'só texto',
              versao.diferenca != null ? textoDaDiferenca(versao.diferenca) : null,
              versao.instrumental ? 'instrumental' : null,
            ].filter(Boolean)
            return (
              <li key={versao.id} className="versao">
                <div className="versao__texto">
                  <strong>{versao.titulo}</strong> <span>{versao.artista}</span>
                  <p className="texto-fraco">{detalhes.join(' · ')}</p>
                </div>
                <button
                  type="button"
                  className="botao"
                  disabled={salvando || emUso}
                  aria-label={`Usar a letra de ${versao.titulo} (${versao.album || versao.artista})`}
                  onClick={() => salvar(() => api.escolherLetra(musica.id, versao.id))}
                >
                  {emUso ? 'Em uso' : 'Usar'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialogo>
  )
}
