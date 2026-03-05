"use client";

import CardTilt from "../../../ui/CardTilt";
import { InformationCardsHowTheServicesWorks } from "./HowWorksSteps";

interface CardIconProps {
  IconComponent: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  isLastCard: boolean;
  cardIndex: number;
}

function CardIcon({ IconComponent, isLastCard, cardIndex }: CardIconProps) {
  if (isLastCard) {
    return (
      <>
        <svg width="0" height="0" className="absolute">
          <defs>
            <linearGradient id={`icon-gradient-${cardIndex}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#FFC18B" />
              <stop offset="100%" stopColor="#DE771D" />
            </linearGradient>
          </defs>
        </svg>
        <IconComponent
          className="w-12 h-12 mx-auto"
          style={{
            fill: `url(#icon-gradient-${cardIndex})`,
            stroke: `url(#icon-gradient-${cardIndex})`,
          }}
        />
      </>
    );
  }

  return <IconComponent className="w-12 h-12 mx-auto text-white" />;
}

export default function HowWorksCard() {
  const totalCardsCount = InformationCardsHowTheServicesWorks.length;

  return (
    <div className="w-full max-w-[1440px] px-4 relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {InformationCardsHowTheServicesWorks.map((cardStep, cardIndex) => {
          const isLastCard = cardIndex === totalCardsCount - 1;
          const CardIconComponent = cardStep.iconCard;

          const cardBackgroundClassName = isLastCard
            ? "bg-[#050019]"
            : "bg-background-secondary";
          const titleClassName = isLastCard
            ? "bg-gradient-to-r from-[#FFC18B] to-secondary bg-clip-text text-transparent"
            : "";
          const textClassName = isLastCard ? "text-secondary" : "text-text-tertiary";

          return (
            <CardTilt key={cardIndex}>
              <div className="flex flex-col gap-12 p-2 md:p-3 border border-border-primary text-center relative">
                <div
                  className={`flex flex-col gap-12 px-4 py-16 md:px-6 md:py-32 text-center ${cardBackgroundClassName}`}
                >
                  <div className="w-12 h-12 mx-auto relative">
                    <CardIcon
                      IconComponent={CardIconComponent}
                      isLastCard={isLastCard}
                      cardIndex={cardIndex}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3
                      className={`text-2xl md:text-3xl lg:text-4xl font-semibold ${titleClassName}`}
                    >
                      {cardStep.titleCard}
                    </h3>

                    <p className={`text-[15px] md:text-[16px] ${textClassName}`}>
                      {cardStep.textCard}
                    </p>
                  </div>
                </div>
              </div>
            </CardTilt>
          );
        })}
      </div>
    </div>
  );
}