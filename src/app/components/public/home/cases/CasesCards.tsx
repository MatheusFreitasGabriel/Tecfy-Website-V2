"use client";

import Image from "next/image";
import CardTilt from "../../../ui/CardTilt";
import { CaseDetailsData } from "./CasesContent";

export default function CasesCards() {
  return (
    <div className="w-full max-w-[1440px] px-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {CaseDetailsData.map((cardCases, cardIndex) => (
          <CardTilt key={cardIndex}>
            <div className="flex flex-col border border-border-primary relative gap-4 overflow-hidden p-4 w-full h-full">
              <div className="w-full aspect-4/3 relative overflow-hidden">
                <Image
                  src={cardCases.imageCase}
                  alt={cardCases.projectName}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 480px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="pt-4 flex flex-col gap-2">
                <p className="font-semibold text-[24px] md:text-[32px]">{cardCases.projectName.toUpperCase()}</p>
                <span className="font-medium text-text-tertiary text-[14px] md:text-[16px]">
                  {cardCases.typePlanProject.toUpperCase()}
                </span>
              </div>
            </div>
          </CardTilt>
        ))}
      </div>
    </div>
  );
} 