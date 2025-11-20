/**
 * Hook for managing cryptographic keys
 * Auto-generates keys if none exist, provides import/export
 */

import { useState, useEffect, useCallback } from 'react';
import { generateX25519KeyPair, generateEd25519KeyPair } from '../../../src/crypto/keys.js';
import { exportKeyPairs, importKeyPairs, importKeyPair, maskPrivateKey } from '../../../src/crypto/export.js';
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
          const parsed = JSON.parse(stored);
          
          // Handle both old format (single KeyExport) and new format (both key pairs)
          let keyExports: { x25519: KeyExport; ed25519: KeyExport };
          
          if (parsed.x25519 && parsed.ed25519) {
            // New format with both key pairs
            keyExports = parsed as { x25519: KeyExport; ed25519: KeyExport };
          } else if (parsed.type) {
            // Old format - single key pair, need to generate the other one
            // If it's Ed25519, we need X25519 and vice versa
            const oldKey = parsed as KeyExport;
            if (oldKey.type === 'ed25519') {
              // Generate X25519 to go with existing Ed25519
              const x25519 = await generateX25519KeyPair();
              const ed25519 = await importKeyPair(oldKey) as Ed25519KeyPair;
              keyExports = exportKeyPairs(x25519, ed25519);
              // Save in new format
              localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExports));
            } else {
              // If it's X25519, we need Ed25519 - but this shouldn't happen in practice
              // Generate both new keys
              throw new Error('Old key format detected - regenerating keys');
            }
          } else {
            throw new Error('Invalid key format in localStorage');
          }
          
          const imported = importKeyPairs(keyExports);
          
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
        const keyExports = exportKeyPairs(x25519, ed25519);
        localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExports));

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

  const importKeys = useCallback(async (keyExports: { x25519: KeyExport; ed25519: KeyExport }) => {
    try {
      const imported = importKeyPairs(keyExports);
      const bearerToken = deriveBearerToken(imported.ed25519.publicKey);
      const maskedPrivateKey = maskPrivateKey(imported.ed25519.privateKey);

      // Save to localStorage
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExports));

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

  const exportKeys = useCallback(async (): Promise<{ x25519: KeyExport; ed25519: KeyExport } | null> => {
    if (!state.x25519 || !state.ed25519) {
      return null;
    }

    try {
      return exportKeyPairs(state.x25519, state.ed25519);
    } catch (error) {
      console.error('Error exporting keys:', error);
      return null;
    }
  }, [state.x25519, state.ed25519]);

  const regenerateKeys = useCallback(async (clearDataCallback?: () => Promise<void>) => {
    try {
      // Clear all encrypted data before regenerating keys
      if (clearDataCallback) {
        try {
          await clearDataCallback();
        } catch (error) {
          console.warn('Error clearing data before key regeneration:', error);
        }
      }

      // Clear localStorage data that may be encrypted or key-specific
      try {
        localStorage.removeItem('chatPanelMessages');
        localStorage.removeItem('chatPersistedRecentRecords');
        // Note: We don't clear settings like apiBase, bearerToken, etc. as those are not encrypted
      } catch (error) {
        console.warn('Error clearing localStorage:', error);
      }

      const x25519 = await generateX25519KeyPair();
      const ed25519 = await generateEd25519KeyPair();
      const bearerToken = deriveBearerToken(ed25519.publicKey);
      const maskedPrivateKey = maskPrivateKey(ed25519.privateKey);

      // Save to localStorage
      const keyExports = exportKeyPairs(x25519, ed25519);
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keyExports));

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

