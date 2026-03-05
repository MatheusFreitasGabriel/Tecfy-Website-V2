"use client";

import { useState, useRef } from "react";

interface CardTiltProps {
  children: React.ReactNode;
  maxTilt?: number;
  perspective?: number;
  transitionDuration?: string;
}

export default function CardTilt({
  children,
  maxTilt = 15,
  perspective = 1000,
  transitionDuration = "0.1s",
}: CardTiltProps) {
  const [tiltStyle, setTiltStyle] = useState({ rotateX: 0, rotateY: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;

    const mouseX = e.clientX - cardCenterX;
    const mouseY = e.clientY - cardCenterY;

    const rotateX = (mouseY / (rect.height / 2)) * -maxTilt;
    const rotateY = (mouseX / (rect.width / 2)) * maxTilt;

    setTiltStyle({ rotateX, rotateY });
  };

  const handleMouseLeave = () => {
    setTiltStyle({ rotateX: 0, rotateY: 0 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(${perspective}px) rotateX(${tiltStyle.rotateX}deg) rotateY(${tiltStyle.rotateY}deg)`,
        transition: `transform ${transitionDuration} ease-out`,
        transformStyle: "preserve-3d",
      }}
      className="w-full"
    >
      {children}
    </div>
  );
}
