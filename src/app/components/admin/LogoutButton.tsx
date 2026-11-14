"use client";

import { useState } from "react";
import { FaRightFromBracket } from "react-icons/fa6";

export default function LogoutButton({ basePath }: { basePath: string }) {
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    try {
      await fetch(`${basePath}/api/session`, { method: "DELETE", credentials: "same-origin", cache: "no-store" });
    } finally {
      window.location.replace(`${basePath}/login`);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="flex items-center gap-2 text-sm uppercase text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50 cursor-pointer"
    >
      <FaRightFromBracket className="h-3.5 w-3.5" />
      {loading ? "Saindo..." : "Sair"}
    </button>
  );
}
