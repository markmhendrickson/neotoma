import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import { encryptForStorage, decryptFromStorage, setEncryptionKeys } from '@/store/encryption';

const LOCAL_URI_PREFIX = 'local://';
const FILES_ROOT_DIR = 'neotoma-files';
const HEADER_ENCRYPTED = 1;
const HEADER_PLAINTEXT = 0;

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

interface LocalPathParts {
  recordId: string;
  fileName: string;
}

interface ObjectUrlHandle {
  url: string;
  revoke: () => void;
}

let rootDirectoryHandle: FileSystemDirectoryHandle | null = null;
let encryptionConfigured = false;
let lastKeyFingerprint: string | null = null;

export function isLocalFilePath(path: string): boolean {
  return typeof path === 'string' && path.startsWith(LOCAL_URI_PREFIX);
}

export async function configureLocalFileEncryption(
  xKey: X25519KeyPair,
  edKey: Ed25519KeyPair
): Promise<void> {
  const fingerprint = buildKeyFingerprint(xKey.publicKey, edKey.publicKey);
  if (lastKeyFingerprint === fingerprint) {
    return;
  }
  await setEncryptionKeys(xKey, edKey);
  encryptionConfigured = true;
  lastKeyFingerprint = fingerprint;
}

export async function persistLocalRecordFile(options: {
  recordId: string;
  fileName: string;
  data: Uint8Array;
}): Promise<string | null> {
  const root = await getRootDirectory(true);
  if (!root) {
    return null;
  }

  const { recordId, fileName, data } = options;
  const safeFileName = buildStoredFileName(fileName);

  try {
    const recordDirectory = await getOrCreateRecordDirectory(root, recordId);
    if (!recordDirectory) {
      return null;
    }

    const fileHandle = await recordDirectory.getFileHandle(safeFileName, { create: true });
    const writable = await fileHandle.createWritable();
    const payload = await wrapPayload(data);
    await writable.write(payload);
    await writable.close();

    return `${LOCAL_URI_PREFIX}${recordId}/${safeFileName}`;
  } catch (error) {
    console.warn('[LocalFiles] Failed to persist file to OPFS', error);
    return null;
  }
}

export async function createLocalFileObjectUrl(
  filePath: string,
  options?: { mimeType?: string }
): Promise<ObjectUrlHandle | null> {
  const parts = parseLocalPath(filePath);
  if (!parts) {
    return null;
  }
  const root = await getRootDirectory(false);
  if (!root) {
    return null;
  }

  try {
    const recordDirectory = await root.getDirectoryHandle(parts.recordId, { create: false });
    const fileHandle = await recordDirectory.getFileHandle(parts.fileName, { create: false });
    const file = await fileHandle.getFile();
    const rawBytes = new Uint8Array(await file.arrayBuffer());
    if (rawBytes.length === 0) {
      return null;
    }
    const encryptedFlag = rawBytes[0];
    const body = rawBytes.slice(1);
    let decrypted: Uint8Array;
    if (encryptedFlag === HEADER_ENCRYPTED) {
      if (!encryptionConfigured) {
        throw new Error('Local encryption keys not configured');
      }
      decrypted = await decryptFromStorage(body);
    } else {
      decrypted = body;
    }
    const blob = new Blob([decrypted], {
      type: options?.mimeType || guessMimeTypeFromName(parts.fileName),
    });
    const url = URL.createObjectURL(blob);
    return {
      url,
      revoke: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    console.warn('[LocalFiles] Failed to create object URL for local file', error);
    return null;
  }
}

export async function deleteLocalFile(filePath: string): Promise<void> {
  const parts = parseLocalPath(filePath);
  if (!parts) {
    return;
  }
  const root = await getRootDirectory(false);
  if (!root) {
    return;
  }

  try {
    const recordDirectory = await root.getDirectoryHandle(parts.recordId, { create: false });
    await recordDirectory.removeEntry(parts.fileName).catch(() => undefined);
    await cleanupRecordDirectory(root, parts.recordId);
  } catch (error) {
    console.warn('[LocalFiles] Failed to delete local file', error);
  }
}

async function cleanupRecordDirectory(root: FileSystemDirectoryHandle, recordId: string): Promise<void> {
  try {
    const dir = await root.getDirectoryHandle(recordId, { create: false });
    const iterator = dir.keys?.();
    if (!iterator) {
      return;
    }
    const first = await iterator.next();
    if (!first.done) {
      return;
    }
    await root.removeEntry(recordId);
  } catch {
    // Ignore cleanup errors
  }
}

function buildKeyFingerprint(xKey: Uint8Array, edKey: Uint8Array): string {
  const parts = [...xKey, 255, ...edKey];
  return parts.join(',');
}

function getStorageManager(): StorageManagerWithDirectory | null {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return null;
  }
  const storage = navigator.storage as StorageManagerWithDirectory;
  if (typeof storage.getDirectory !== 'function') {
    return null;
  }
  return storage;
}

async function getRootDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (rootDirectoryHandle) {
    return rootDirectoryHandle;
  }
  const storage = getStorageManager();
  if (!storage) {
    return null;
  }
  try {
    const opfsRoot = await storage.getDirectory!();
    rootDirectoryHandle = await opfsRoot.getDirectoryHandle(FILES_ROOT_DIR, { create });
    return rootDirectoryHandle;
  } catch (error) {
    if (create) {
      console.warn('[LocalFiles] Unable to access OPFS directory', error);
    }
    return null;
  }
}

async function getOrCreateRecordDirectory(
  root: FileSystemDirectoryHandle,
  recordId: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await root.getDirectoryHandle(recordId, { create: true });
  } catch (error) {
    console.warn('[LocalFiles] Failed to access record directory', error);
    return null;
  }
}

function parseLocalPath(filePath: string): LocalPathParts | null {
  if (!isLocalFilePath(filePath)) {
    return null;
  }
  const remainder = filePath.slice(LOCAL_URI_PREFIX.length);
  const firstSlash = remainder.indexOf('/');
  if (firstSlash <= 0 || firstSlash === remainder.length - 1) {
    return null;
  }
  return {
    recordId: remainder.slice(0, firstSlash),
    fileName: remainder.slice(firstSlash + 1),
  };
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'file';
}

function buildStoredFileName(originalName: string): string {
  const sanitized = sanitizeFileName(originalName);
  const timestamp = Date.now();
  return `${timestamp}-${sanitized}`;
}

async function wrapPayload(data: Uint8Array): Promise<Uint8Array> {
  let body: Uint8Array;
  if (encryptionConfigured) {
    try {
      body = await encryptForStorage(data);
      return concatHeaderAndBody(HEADER_ENCRYPTED, body);
    } catch (error) {
      console.warn('[LocalFiles] Encryption failed, storing plaintext', error);
    }
  }
  body = data;
  return concatHeaderAndBody(HEADER_PLAINTEXT, body);
}

function concatHeaderAndBody(header: number, body: Uint8Array): Uint8Array {
  const result = new Uint8Array(body.length + 1);
  result[0] = header;
  result.set(body, 1);
  return result;
}

function guessMimeTypeFromName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}


