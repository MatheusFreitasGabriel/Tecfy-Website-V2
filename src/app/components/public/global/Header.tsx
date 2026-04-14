'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BtnCta from '../../ui/BtnCta'
import { FaBars, FaXmark } from 'react-icons/fa6'

const SCROLL_THRESHOLD_PX = 150

const MAIN_NAV_LINKS = [
  { label: 'Como Funciona', href: '/#how-it-works' },
  { label: 'Portfólio', href: '/#cases' },
  { label: 'Planos e Preços', href: '/#prices' },
  { label: 'Depoimentos', href: '/#testimonials' },
] as const

export default function Header() {
  const pathname = usePathname()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isPoliticasPage = pathname.startsWith('/politicas')

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > SCROLL_THRESHOLD_PX)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset'
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (isPoliticasPage && isMobileMenuOpen) {
      setMobileMenuOpen(false)
    }
  }, [isPoliticasPage, isMobileMenuOpen])

  const toggleMobileMenu = () => setMobileMenuOpen((open) => !open)
  const closeMobileMenu = () => setMobileMenuOpen(false)

  const showSolidHeader = isScrolled || isMobileMenuOpen
  const showDesktopNav = isScrolled

  if (isPoliticasPage) {
    return null
  }

  return (
    <>
      <header
        className={`
          w-full fixed top-0 left-0 right-0 z-60 py-6 px-6 md:px-14
          grid grid-cols-2 lg:grid-cols-3 items-center
          transition-all duration-300 ease-in-out
          ${showSolidHeader ? 'bg-black shadow-lg' : 'bg-transparent'}
        `}
      >
        <div className="flex justify-start">
          <Link
            href="/#hero"
            onClick={closeMobileMenu}
            className="hover:opacity-80 transition-opacity"
          >
            <Image
              src="assets/visual-identity/logo-tecfy.svg"
              alt="Tecfy Logo"
              width={91}
              height={24}
            />
          </Link>
        </div>

        <nav
          className={`
            hidden lg:flex justify-center transition-all duration-300
            ${showDesktopNav ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}
        >
          <ul className="flex gap-6 text-white whitespace-nowrap">
            {MAIN_NAV_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:opacity-70 transition-opacity uppercase"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex justify-end items-center gap-4">
          <div className="hidden lg:block">
            <BtnCta />
          </div>

          <button
            type="button"
            className="lg:hidden text-white z-70"
            onClick={toggleMobileMenu}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {isMobileMenuOpen ? <FaXmark size={24} /> : <FaBars size={24} />}
          </button>
        </div>
      </header>

      <div
        className={`
          fixed inset-0 bg-black z-55 lg:hidden
          transition-transform duration-500 ease-in-out
          ${isMobileMenuOpen ? 'translate-y-0' : '-translate-y-full'}
          flex flex-col items-center justify-center
        `}
        aria-hidden={!isMobileMenuOpen}
      >
        <nav aria-label="Menu principal mobile">
          <ul className="flex flex-col gap-8 text-center">
            {MAIN_NAV_LINKS.map((item, index) => (
              <li
                key={item.href}
                className={`
                  transition-all duration-500
                  ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
                `}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <Link
                  href={item.href}
                  onClick={closeMobileMenu}
                  className="text-[18px] text-white font-medium hover:text-secondary transition-colors uppercase"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li
              className={`
                mt-4 transition-all duration-500
                ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}
              `}
              style={{ transitionDelay: '400ms' }}
            >
              <BtnCta />
            </li>
          </ul>
        </nav>
      </div>
    </>
  )
}
