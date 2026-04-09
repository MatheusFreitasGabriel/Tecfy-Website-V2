import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

export default function Input({ label, id, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      <label 
        htmlFor={id} 
        className="text-white font-bold uppercase text-[15px] sm:text-base tracking-wide"
      >
        {label}
      </label>
      
      <input
        id={id}
        {...props}
        className={`w-full p-4 bg-[#0a0a0a] border border-[#2a2a2a] text-white placeholder-gray-500 outline-none transition-colors focus:border-white focus:bg-[#111111] ${className}`}
      />
    </div>
  );
}