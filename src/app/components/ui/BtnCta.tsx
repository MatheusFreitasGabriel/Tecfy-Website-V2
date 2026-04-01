"use client";

import { useRouter } from "next/navigation";

export default function BtnCta() {
  const router = useRouter();

  function handleClick() {
    router.push("/contato")
  };

  return (
    <button
      onClick={handleClick}
      className="
        relative
        overflow-hidden
        h-14
        w-64
        border
        cursor-pointer
        border-white
        text-text-primary
        text-[16px]
        transition-colors
        duration-300
        before:absolute
        before:inset-0
        before:bg-white
        before:origin-left
        before:scale-x-0
        before:transition-transform
        before:duration-300
        hover:before:scale-x-100
        hover:text-black
    
      "
    >
      <span className="relative z-10">
        MARCAR UMA REUNIÃO
      </span>
    </button>
  );
}
