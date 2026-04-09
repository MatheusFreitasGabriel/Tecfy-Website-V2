"use client";

import React, { useState } from 'react';
import { maskPhoneNumber } from '@/utils/masks';
import Input from '../../ui/Input';
import { validateEmail, validatePhone } from '@/shemas/validationSchema';
import { LeadInsertResponseData, LeadRequest } from '@/services/types';
import { insertLead, LeadInsertError } from '@/services/leads/insertLead';
import ApiFeedbackModal from './ApiFeedbackModal';

export default function Form() {
  const [formData, setFormData] = useState<LeadRequest>({
    lead_name: "",
    lead_email: "",
    lead_phone: "",
    interest_plan: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"success" | "error" | "conflict" | "rate_limit">("success");
  const [responseData, setResponseData] = useState<LeadInsertResponseData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhone = maskPhoneNumber(e.target.value);
    setFormData({ ...formData, lead_phone: formattedPhone });
  };

  const isFormValid = 
    formData.lead_name.trim().length > 0 &&
    validateEmail(formData.lead_email) &&
    validatePhone(formData.lead_phone);

  const closeModal = () => {
    setIsModalOpen(false);
    setResponseData(null);
    setErrorMessage("");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    
    if (!isFormValid) return; 

    try {
      setIsLoading(true);
      const data = await insertLead(formData);
      setResponseData(data);
      setModalType("success");
      setIsModalOpen(true);

      console.log("Lead enviado com sucesso:", data);
    } catch (error) {
      console.error("Erro ao enviar lead:", error);
      if (error instanceof LeadInsertError) {
        if (error.status === 409) {
          setModalType("conflict");
          setErrorMessage("");
        } else if (error.status === 429) {
          setModalType("rate_limit");
          setErrorMessage("");
        } else {
          setModalType("error");
          setErrorMessage(error.message);
        }
      } else {
        setModalType("error");
        setErrorMessage("Erro de conexao com a API.");
      }
      setIsModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='max-w-[592px] w-full p-2 md:p-4 border border-[#252525]'>
      <form onSubmit={handleSubmit} className=' flex flex-col gap-6 justify-between p-4 md:p-9 border border-[#252525]'>
        <Input 
          id="nome"
          label="Nome completo"
          type="text"
          placeholder="Ex: John Doe"
          required
          value={formData.lead_name}
          onChange={(e) => setFormData({ ...formData, lead_name: e.target.value })}
        />
        <Input 
          id="email"
          label="Email"
          type="email" // Alterado para "email" por semântica
          placeholder="johndoe@tecfy.dev"
          required
          value={formData.lead_email}
          onChange={(e) => setFormData({ ...formData, lead_email: e.target.value })}
        />
        <Input 
          id="phone"
          label="Telefone"
          type="tel"
          placeholder="(12) 12345-1234"
          required
          value={formData.lead_phone}
          onChange={handlePhoneChange}
        />

        {/* 3. BOTÃO DINÂMICO */}
        <button 
          type="submit" 
          disabled={!isFormValid || isLoading} // Desabilita se a validação falhar
          className={`w-full h-12 md:h-[56px] uppercase font-semibold transition-all duration-300 ${
            isFormValid && !isLoading
              ? 'bg-white text-black hover:bg-gray-200 cursor-pointer' // Estilo quando Válido
              : 'bg-[#252525] text-gray-500 cursor-not-allowed'         // Estilo quando Inválido (Dark theme)
          }`}
        >
          {isLoading ? "Enviando..." : "Enviar dados"}
        </button>
      </form>

      <ApiFeedbackModal
        isOpen={isModalOpen}
        type={modalType}
        responseData={responseData}
        errorMessage={errorMessage}
        onClose={closeModal}
      />
    </div>
  );
}