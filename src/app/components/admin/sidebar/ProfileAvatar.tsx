interface ProfileAvatarProps {
  email: string | null;
  name: string | null;
  picture: string | null;
}

/**
 * Foto de perfil da conta logada (photoURL do Firebase Auth).
 * Sem foto cadastrada, mostra a inicial do nome/e-mail no mesmo círculo.
 */
export default function ProfileAvatar({ email, name, picture }: ProfileAvatarProps) {
  const label = name ?? email ?? "Conta";
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      title={label}
      className="flex h-[43px] w-[43px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-input bg-background-surface"
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa do Firebase; evita configurar remotePatterns
        <img src={picture} alt={label} width={43} height={43} className="h-full w-full object-cover" />
      ) : (
        <span aria-label={label} className="text-base font-medium text-text-muted">
          {initial}
        </span>
      )}
    </div>
  );
}
