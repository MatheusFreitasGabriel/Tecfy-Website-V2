'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import BtnCta from '../../ui/BtnCta'
import { FaBars, FaXmark } from 'react-icons/fa6'

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 150)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Impede o scroll do fundo quando o menu está aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const navLinks = [
    { label: 'COMO FUNCIONA', href: '/#how-it-works' },
    { label: 'PORTFÓLIO', href: '/#cases' },
    { label: 'PLANOS E PREÇOS', href: '/#prices' },
    { label: 'DEPOIMENTOS', href: '/#testimonials' },
  ]

  return (
    <>
      <header 
        className={`
          w-full fixed top-0 left-0 right-0 z-60 py-6 px-6 md:px-14
          grid grid-cols-2 lg:grid-cols-3 items-center
          transition-all duration-300 ease-in-out
          ${scrolled || isOpen ? 'bg-black shadow-lg' : 'bg-transparent'}
        `}
      >
        {/* Coluna 1: Logo */}
        <div className="flex justify-start">
          <Link href="/#hero" onClick={() => setIsOpen(false)} className="hover:opacity-80 transition-opacity">
            <Image 
              src="assets/visual-identity/logo-tecfy.svg" 
              alt="Tecfy Logo" 
              width={91} 
              height={24} 
            />
          </Link>
        </div>
        
        {/* Coluna 2: Menu Desktop */}
        <nav className="hidden lg:flex justify-center">
          <ul className='flex gap-6 text-white whitespace-nowrap'>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className='hover:opacity-70 transition-opacity'>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Coluna 3: Botão Desktop + Hamburger Mobile */}
        <div className="flex justify-end items-center gap-4">
          <div className="hidden lg:block">
            <BtnCta />
          </div>
          
          {/* Botão Hamburger */}
          <button 
            className="lg:hidden text-white z-70"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle Menu"
          >
            {isOpen ? <FaXmark size={24} /> : <FaBars size={24} />}
          </button>
        </div>
      </header>

      {/* Menu Mobile Fullscreen */}
      <div 
        className={`
          fixed inset-0 bg-black z-55 lg:hidden
          transition-transform duration-500 ease-in-out
          ${isOpen ? 'translate-y-0' : '-translate-y-full'}
          flex flex-col items-center justify-center
        `}
      >
        <nav>
          <ul className='flex flex-col gap-8 text-center'>
            {navLinks.map((link, index) => (
              <li 
                key={link.href}
                className={`
                  transition-all duration-500 delay-[${index * 100}ms]
                  ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
                `}
              >
                <Link 
                  href={link.href} 
                  onClick={() => setIsOpen(false)}
                  className='text-[18px] text-white font-medium hover:text-secondary transition-colors'
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className={`mt-4 transition-all duration-500 delay-400 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
              <BtnCta />
            </li>
          </ul>
        </nav>
      </div>
    </>
  )
}