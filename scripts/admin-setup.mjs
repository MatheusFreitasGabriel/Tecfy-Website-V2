#!/usr/bin/env node
/**
 * Utilitário LOCAL de administração do painel (usa a service account do Firebase).
 *
 * Uso:
 *   node --env-file=.env.local scripts/admin-setup.mjs enable-totp          # liga o 2FA TOTP no projeto (1x)
 *   node --env-file=.env.local scripts/admin-setup.mjs grant  <email>       # dá acesso ao painel (claim admin)
 *   node --env-file=.env.local scripts/admin-setup.mjs allow-enroll <email> # abre a janela de 30 min p/ cadastrar o 2FA
 *   node --env-file=.env.local scripts/admin-setup.mjs reset-2fa <email>    # remove o autenticador e abre a janela
 *   node --env-file=.env.local scripts/admin-setup.mjs revoke <email>       # remove o acesso e derruba sessões
 *   node --env-file=.env.local scripts/admin-setup.mjs status <email>       # mostra claim, 2FA e status
 *   node --env-file=.env.local scripts/admin-setup.mjs set-name <email> "Nome"   # nome exibido no painel
 *   node --env-file=.env.local scripts/admin-setup.mjs set-photo <email> <url>   # foto de perfil (vazio remove)
 *
 * Segurança: o cadastro do 2FA (QR code no login) só funciona dentro da janela aberta por
 * grant / allow-enroll / reset-2fa. Fora dela, quem souber só a senha não registra o próprio celular.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const ENROLL_WINDOW_MS = 30 * 60 * 1000;

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error("Faltam FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (use --env-file=.env.local).");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const auth = getAuth();

const [command, emailArg, valueArg] = process.argv.slice(2);

async function getUserOrExit(email) {
  if (!email) {
    console.error("Informe o email.");
    process.exit(1);
  }
  try {
    return await auth.getUserByEmail(email.trim().toLowerCase());
  } catch {
    console.error(`Usuário ${email} não encontrado. Crie-o antes no Firebase Console → Authentication.`);
    process.exit(1);
  }
}

function hasTotp(user) {
  return (user.multiFactor?.enrolledFactors ?? []).length > 0;
}

async function openEnrollWindow(user) {
  const until = Date.now() + ENROLL_WINDOW_MS;
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), mfa_enroll_until: until });
  console.log(`✓ Janela para cadastrar o 2FA aberta até ${new Date(until).toLocaleString("pt-BR")} (30 min).`);
}

switch (command) {
  case "enable-totp": {
    await auth.projectConfigManager().updateProjectConfig({
      multiFactorConfig: {
        providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 1 } }],
      },
    });
    console.log("✓ 2FA TOTP ativado no projeto.");
    try {
      await auth.projectConfigManager().updateProjectConfig({ emailPrivacyConfig: { enableImprovedEmailPrivacy: true } });
      console.log("✓ Proteção contra enumeração de email ativada.");
    } catch {
      console.log("! Não foi possível ativar a proteção contra enumeração de email (ative no console).");
    }
    break;
  }
  case "grant": {
    let user = await getUserOrExit(emailArg);
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
    // O Firebase só permite cadastrar 2FA (TOTP) em contas com email verificado.
    // A conta foi criada manualmente pelo dono do projeto, então marcamos como verificada.
    if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true });
    await auth.revokeRefreshTokens(user.uid);
    console.log(`✓ ${user.email} agora tem acesso ao painel (email marcado como verificado).`);
    user = await auth.getUser(user.uid);
    if (!hasTotp(user)) await openEnrollWindow(user);
    break;
  }
  case "allow-enroll": {
    const user = await getUserOrExit(emailArg);
    if (user.customClaims?.admin !== true) {
      console.error("Esse usuário não é admin. Rode `grant` antes.");
      process.exit(1);
    }
    if (hasTotp(user)) {
      console.error("Esse usuário já tem 2FA cadastrado. Use `reset-2fa` se ele perdeu o autenticador.");
      process.exit(1);
    }
    await openEnrollWindow(user);
    break;
  }
  case "revoke": {
    const user = await getUserOrExit(emailArg);
    const rest = { ...(user.customClaims ?? {}) };
    delete rest.admin;
    delete rest.mfa_enroll_until;
    await auth.setCustomUserClaims(user.uid, rest);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`✓ Acesso de ${user.email} removido e sessões revogadas.`);
    break;
  }
  case "reset-2fa": {
    const user = await getUserOrExit(emailArg);
    await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
    await auth.revokeRefreshTokens(user.uid);
    console.log(`✓ Autenticador de ${user.email} removido e sessões revogadas.`);
    await openEnrollWindow(await auth.getUser(user.uid));
    break;
  }
  case "status": {
    const user = await getUserOrExit(emailArg);
    const until = user.customClaims?.mfa_enroll_until;
    console.log({
      email: user.email,
      nome: user.displayName ?? null,
      foto: user.photoURL ?? null,
      disabled: user.disabled,
      emailVerified: user.emailVerified,
      admin: user.customClaims?.admin === true,
      factors: (user.multiFactor?.enrolledFactors ?? []).map((f) => ({ factorId: f.factorId, enrolled: f.enrollmentTime })),
      janelaCadastro2FA: typeof until === "number" && until > Date.now() ? new Date(until).toLocaleString("pt-BR") : "fechada",
      lastSignIn: user.metadata.lastSignInTime,
    });
    break;
  }
  case "set-name": {
    const user = await getUserOrExit(emailArg);
    const name = (valueArg ?? "").trim();
    if (!name || name.length > 80) {
      console.error('Informe o nome (até 80 caracteres): set-name <email> "Nome Sobrenome"');
      process.exit(1);
    }
    await auth.updateUser(user.uid, { displayName: name });
    console.log(`✓ Nome de ${user.email} definido como "${name}".`);
    break;
  }
  case "set-photo": {
    const user = await getUserOrExit(emailArg);
    const url = (valueArg ?? "").trim();
    if (url && !/^https:\/\//.test(url)) {
      console.error("A foto precisa ser uma URL https:// (ou vazio para remover).");
      process.exit(1);
    }
    await auth.updateUser(user.uid, { photoURL: url || null });
    console.log(url ? `✓ Foto de ${user.email} atualizada.` : `✓ Foto de ${user.email} removida.`);
    break;
  }
  default:
    console.log("Comandos: enable-totp | grant <email> | allow-enroll <email> | reset-2fa <email> | revoke <email> | status <email> | set-name <email> <nome> | set-photo <email> <url>");
    process.exit(command ? 1 : 0);
}
