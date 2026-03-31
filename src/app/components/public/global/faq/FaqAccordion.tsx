"use client";

import { useState } from "react";
import { accordionData } from "./FaqData";
import { FaPlus } from "react-icons/fa";

export default function FaqAccordion() {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="w-full flex flex-col">
      {accordionData.map((item) => {
        const isOpen = openId === item.id;

        return (
          <div
            key={item.id}
            onClick={() => setOpenId(isOpen ? null : item.id)}
            className="border-b-2 border-b-text-tertiary pt-9 pb-9 flex flex-col gap-4 cursor-pointer"
          >
            <div className="w-full flex flex-row justify-between items-center gap-4">
              <h3
                className={`text-[18px] lg:text-[20px] font-semibold transition-colors duration-300 ${
                  isOpen ? "text-text-primary" : "text-text-tertiary"
                }`}
              >
                {item.question.toUpperCase()}
              </h3>
              
              <div
                className={`transition-all duration-300 transform ${
                  isOpen ? "rotate-45 text-text-primary" : "rotate-0 text-[#767676]"
                }`}
              >
                <FaPlus size={12} />
              </div>
            </div>

            <div
              className={`overflow-hidden transition-all duration-500 ease-in-out ${
                isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <p className="text-[16px] text-text-secondary leading-relaxed">
                {item.response}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}