"use client"

import { testimonialsList } from "./TestimonialsPersonsData";
import { MdFormatQuote, MdChevronLeft, MdChevronRight } from "react-icons/md";
import Image from "next/image";
// Import do Swiper
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

export default function TestimonialsPersons() {
    return (
        <div className="relative w-full px-4 mt-6 md:px-20 group max-w-[1440px]">
            <Swiper
                modules={[Navigation]}
                spaceBetween={50}
                slidesPerView={1}
                navigation={{
                    nextEl: '.button-next',
                    prevEl: '.button-prev',
                }}
                className="w-full"
            >
                {testimonialsList.map((item) => (
                    <SwiperSlide key={item.id}>
                        {/* Grid: Coluna única no mobile, duas colunas no desktop */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center min-h-[500px]">
                            
                            {/* LADO ESQUERDO: Texto (Fica em cima no Mobile) */}
                            <div className="flex flex-col items-start justify-center order-1 md:order-1">
                                <MdFormatQuote className="text-[#333333] text-[64px] md:text-[96px] mb-4 transform -scale-x-100" />
                                <h3 className="text-2xl md:text-4xl font-semibold mb-6 text-white">
                                    {item.testimonial}
                                </h3>

                                <div className="mt-4 border-l-4 border-[#979797] pl-4">
                                    <p className="font-medium text-lg text-white">{item.name}</p>
                                    <p className="text-[#979797]">{item.position}</p>
                                </div>
                            </div>

                            {/* LADO DIREITO: Imagem (Fica embaixo no Mobile) */}
                            <div className="relative w-full h-[500px] md:h-[700px] order-2 md:order-2 overflow-hidden">
                                <Image 
                                    src={item.profilePhoto} 
                                    alt={item.name}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>

            {/* CONTROLES: Setas customizadas */}
            {/* Esquerda: Só aparece se houver slide anterior (o Swiper lida com o estado 'disabled') */}
            <button className="button-prev cursor-pointer absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2  rounded-full  hover:transition-all disabled:opacity-0">
                <MdChevronLeft size={40} className="text-white" />
            </button>

            {/* Direita: Fica após a imagem no layout total */}
            <button className="button-next cursor-pointer absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full hover:transition-all disabled:opacity-0">
                <MdChevronRight size={40} className="text-white" />
            </button>
        </div>
    );
}