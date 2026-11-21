import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'principal' | 'secondaire'
}

const styles = {
  principal: 'bg-vert text-blanc hover:bg-vertFonce disabled:bg-inactif disabled:hover:bg-inactif',
  secondaire:
    'bg-blanc text-vert border-2 border-vert hover:bg-vert hover:text-blanc disabled:border-discret disabled:text-inactif disabled:hover:bg-blanc disabled:hover:text-inactif',
}

export default function Bouton({ variante = 'principal', className = '', ...reste }: Props) {
  return (
    <button
      className={`min-h-[56px] w-full rounded-pilule px-8 text-lg font-semibold transition-colors disabled:cursor-not-allowed ${styles[variante]} ${className}`}
      {...reste}
    />
  )
}
