// utils/cryptoClient.js
import * as jose from 'jose';

export async function generateEphemeralKeyPair() {
  const { publicKey, privateKey } = await jose.generateKeyPair('RSA-OAEP-256');
  const publicJwk = await jose.exportJWK(publicKey);   // lo que se envía al backend
  return { publicJwk, privateKey };
}

export async function decryptEncryptedBlob(jweCompact, privateKey) {
  const { plaintext } = await jose.compactDecrypt(jweCompact, privateKey);
  const decoded = new TextDecoder().decode(plaintext);
  return JSON.parse(decoded);
}
