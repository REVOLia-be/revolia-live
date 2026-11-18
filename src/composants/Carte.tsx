import type { HTMLAttributes } from 'react'

export default function Carte({ className = '', ...reste }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-carte border border-vertClair/60 bg-blanc p-6 shadow-sm ${className}`}
      {...reste}
    />
  )
}
