/**
 * O logo do Encore: um disco de vinil com os sulcos e o selo laranja no meio.
 * É enfeite (o nome vem escrito ao lado), então fica escondido do leitor de tela.
 */
export function LogoVinil({ tamanho = 44 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="21" fill="#0c0b0b" stroke="var(--border)" />
      <g fill="none" stroke="#2a2624" strokeWidth="1">
        <circle cx="22" cy="22" r="17.5" />
        <circle cx="22" cy="22" r="14.5" />
        <circle cx="22" cy="22" r="11.5" />
      </g>
      <circle cx="22" cy="22" r="8" fill="var(--marca)" />
      <circle cx="22" cy="22" r="1.6" fill="#0c0b0b" />
    </svg>
  )
}
