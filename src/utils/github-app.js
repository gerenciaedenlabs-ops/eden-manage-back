// Cliente mínimo de GitHub App: autentica al backend como la instalación de
// la App en la organización de EdenLabs (no como una cuenta personal), para
// poder listar/crear repositorios sin depender de un token de una sola
// persona. Sin dependencias nuevas: firma el JWT de la App con
// `jsonwebtoken` (ya usado para las sesiones propias) y llama a la API REST
// de GitHub con `fetch` nativo de Node.
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const GITHUB_API = "https://api.github.com";

// El private key de una GitHub App es un PEM multilínea; en .env se guarda
// con "\n" literales (dotenv no soporta multilínea real), así que acá se
// revierte esa escapada antes de usarlo para firmar.
const getPrivateKey = () => (env.github.privateKey || "").replace(/\\n/g, "\n");

// JWT de la App (identifica a la App misma ante GitHub, no a una instalación
// concreta): vive máximo 10 minutos y solo sirve para pedir un installation
// token — nunca se usa directo contra endpoints de repos.
const buildAppJwt = () => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: env.github.appId },
    getPrivateKey(),
    { algorithm: "RS256" }
  );
};

const githubFetch = async (path, token, options = {}) => {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`GitHub API respondió ${response.status} en ${path}: ${body}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
};

// Resuelve el installation_id de la App instalada en env.github.org (una
// sola vez por proceso — no cambia mientras la App siga instalada ahí).
let cachedInstallationId = null;

const getInstallationId = async () => {
  if (cachedInstallationId) return cachedInstallationId;

  const appJwt = buildAppJwt();
  const installations = await githubFetch("/app/installations", appJwt);
  const match = installations.find(
    (i) => i.account?.login?.toLowerCase() === (env.github.org || "").toLowerCase()
  );

  if (!match) {
    throw new Error(
      `La GitHub App no está instalada en la organización "${env.github.org}" (o GITHUB_ORG está mal configurado).`
    );
  }

  cachedInstallationId = match.id;
  return cachedInstallationId;
};

// Installation access token: vive 1 hora: se cachea en memoria con 2
// minutos de margen antes de expirar para renovarlo a tiempo.
let cachedInstallationToken = null;
let cachedInstallationTokenExpiresAt = 0;

const getInstallationToken = async () => {
  if (cachedInstallationToken && Date.now() < cachedInstallationTokenExpiresAt) {
    return cachedInstallationToken;
  }

  const appJwt = buildAppJwt();
  const installationId = await getInstallationId();
  const { token, expires_at } = await githubFetch(
    `/app/installations/${installationId}/access_tokens`,
    appJwt,
    { method: "POST" }
  );

  cachedInstallationToken = token;
  cachedInstallationTokenExpiresAt = new Date(expires_at).getTime() - 2 * 60 * 1000;
  return cachedInstallationToken;
};

// Punto de entrada único para el resto del backend: garantiza un
// installation token válido y llama a la API de GitHub con él (repos
// visibles a la instalación de la App, no a toda la cuenta de una persona).
export const githubApiRequest = (path, options = {}) =>
  getInstallationToken().then((token) => githubFetch(path, token, options));
