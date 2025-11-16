/**
 * Hook for managing cryptographic keys
 * Auto-generates keys if none exist, provides import/export
 */

import { useState, useEffect, useCallback } from 'react';
import { generateX25519KeyPair, generateEd25519KeyPair } from '../../../src/crypto/keys.js';
import { exportKeyPair, importKeyPair, maskPrivateKey } from '../../../src/crypto/export.js';
import { deriveBearerToken } from '../../../src/crypto/keys.js';
import type { X25519KeyPair, Ed25519KeyPair, KeyExport } from '../../../src/crypto/types.js';

const KEYS_STORAGE_KEY = 'neotoma_keys';

/**
 * SECURITY NOTE: Private keys are stored in localStorage in base64url-encoded format.
 * While localStorage is protected from CSRF attacks, it is still vulnerable to XSS.
 * For a local-first application where the browser is the authoritative datastore,
 * this is an acceptable trade-off. Users should:
 * 1. Only use the app on trusted devices
 * 2. Export and backup their keys regularly
 * 3. Be aware that browser extensions with excessive permissions could access keys
 */

interface KeysState {
  x25519: X25519KeyPair | null;
  ed25519: Ed25519KeyPair | null;
  bearerToken: string;
  maskedPrivateKey: string;
  loading: boolean;
}

export function useKeys() {
  const [state, setState] = useState<KeysState>({
    x25519: null,
    ed25519: null,
    bearerToken: '',
    maskedPrivateKey: '',
    loading: true,
  });

  // Load or generate keys
  useEffect(() => {
    async function initKeys() {
      try {
        // Try to load from localStorage
        const stored = localStorage.getItem(KEYS_STORAGE_KEY);
        if (stored) {
          const keyExport = JSON.parse(stored) as KeyExport;
          const imported = await importKeyPair(keyExport);
          
          setState({
            x25519: imported.x25519,
            ed25519: imported.ed25519,
            bearerToken: deriveBearerToken(imported.ed25519.publicKey),
            maskedPrivateKey: maskPrivateKey(imported.ed25519.privateKey),
            loading: false,
          });
          return;
        }

        // Generate new keys
        const x25519 = await generateX25519KeyPair();
        const ed25519 = await generateEd25519KeyPair();
        const bearerToken = deriveBearerToken(ed25519.publicKey);
        const maskedPrivateKey = maskPrivateKey(ed25519.privateKey);

        // Save to localStorage
        const keyExport = await exportKeyPair(x25519, ed25519);
        localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExport));

        setState({
          x25519,
          ed25519,
          bearerToken,
          maskedPrivateKey,
          loading: false,
        });
      } catch (error) {
        console.error('Error initializing keys:', error);
        setState(prev => ({ ...prev, loading: false }));
      }
    }

    initKeys();
  }, []);

  const importKeys = useCallback(async (keyExport: KeyExport) => {
    try {
      const imported = await importKeyPair(keyExport);
      const bearerToken = deriveBearerToken(imported.ed25519.publicKey);
      const maskedPrivateKey = maskPrivateKey(imported.ed25519.privateKey);

      // Save to localStorage
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExport));

      setState({
        x25519: imported.x25519,
        ed25519: imported.ed25519,
        bearerToken,
        maskedPrivateKey,
        loading: false,
      });

      return true;
    } catch (error) {
      console.error('Error importing keys:', error);
      return false;
    }
  }, []);

  const exportKeys = useCallback(async (): Promise<KeyExport | null> => {
    if (!state.x25519 || !state.ed25519) {
      return null;
    }

    try {
      return await exportKeyPair(state.x25519, state.ed25519);
    } catch (error) {
      console.error('Error exporting keys:', error);
      return null;
    }
  }, [state.x25519, state.ed25519]);

  const regenerateKeys = useCallback(async () => {
    try {
      const x25519 = await generateX25519KeyPair();
      const ed25519 = await generateEd25519KeyPair();
      const bearerToken = deriveBearerToken(ed25519.publicKey);
      const maskedPrivateKey = maskPrivateKey(ed25519.privateKey);

      // Save to localStorage
      const keyExport = await exportKeyPair(x25519, ed25519);
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExport));

      setState({
        x25519,
        ed25519,
        bearerToken,
        maskedPrivateKey,
        loading: false,
      });

      return true;
    } catch (error) {
      console.error('Error regenerating keys:', error);
      return false;
    }
  }, []);

  return {
    ...state,
    importKeys,
    exportKeys,
    regenerateKeys,
  };
}

