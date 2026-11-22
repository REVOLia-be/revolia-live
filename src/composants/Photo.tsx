import { useState } from 'react'
import { urlPhoto } from '../lib/photos'

// Une photo du stockage dans une boîte dont la taille est fixée par le parent (la photo s'y inscrit en entier, sans être coupée
// si `ajuste` = « contain », ou remplit la boîte si « cover »). Tant qu'elle charge, un fond neutre occupe la place : pas de saut de mise en page.
// Si le chargement échoue, un message court remplace l'image.
export default function Photo({
  chemin,
  alt,
  ajuste = 'contain',
  fond = 'clair',
  className = '',
}: {
  chemin: string
  alt: string
  ajuste?: 'contain' | 'cover'
  fond?: 'clair' | 'projete'
  className?: string
}) {
  const [etat, setEtat] = useState<'charge' | 'ok' | 'erreur'>('charge')
  return (
    <div className={`${/\babsolute\b/.test(className) ? '' : 'relative'} overflow-hidden ${fond === 'clair' ? 'photo-fond-clair' : 'photo-fond-projete'} ${className}`}>
      {etat !== 'erreur' && (
        <img
          src={urlPhoto(chemin)}
          alt={alt}
          decoding="async"
          draggable={false}
          onLoad={() => setEtat('ok')}
          onError={() => setEtat('erreur')}
          className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${ajuste === 'contain' ? 'object-contain' : 'object-cover'} ${etat === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {etat === 'charge' && <span aria-hidden className="photo-chargement absolute inset-0" />}
      {etat === 'erreur' && (
        <span role="img" aria-label={alt} className="absolute inset-0 flex items-center justify-center p-2 text-center text-sm font-semibold">
          Photo indisponible
        </span>
      )}
    </div>
  )
}
