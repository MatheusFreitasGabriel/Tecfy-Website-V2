import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { footerNavigation } from './footerData'

export default function Footer() {
  return (
    <footer className='w-full pt-12 md:pt-32 pb-6 md:pb-12 px-6 md:px-14 bg-black flex flex-col gap-9 md:gap-16 text-white'>
      <div className='flex flex-col gap-4'>
        <Image
          src="/assets/visual-identity/logo-tecfy.svg"
          alt='Logo Tecfy'
          width={91}
          height={24}
          priority
        />
        <p className='max-w-xs opacity-80 text-sm'>
          Avenida Presidente Médici, 117 - Sala 1, Jd Aliança, Osasco - SP
        </p>
      </div>

      <div className='grid grid-cols-2 md:grid-cols-4 gap-8'>
        {footerNavigation.map((section) => (
          <div key={section.title} className='flex flex-col gap-4'>
            <h3 className='font-semibold text-lg'>{section.title}</h3>
            <ul className='flex flex-col gap-2'>
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link 
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    className='opacity-70 hover:opacity-100 transition-opacity text-[16px]'
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className='pt-8 border-t border-white/10 text-center text-sm opacity-50'>
        © {new Date().getFullYear()} Tecfy Tecnologia e Software LTDA. Todos os direitos reservados.
      </div>
    </footer>
  )
}