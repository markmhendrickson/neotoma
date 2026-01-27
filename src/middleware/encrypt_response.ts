/**
 * Response encryption middleware
 * Encrypts HTTP responses when client requests encrypted mode
 */

import type { Request, Response, NextFunction } from "express";
import { encryptResponse } from "../services/encryption_service.js";

/**
 * Middleware to encrypt responses if requested
 * Checks for X-Encrypt-Response header or encrypted mode
 */
export function encryptResponseMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalJson = res.json.bind(res);
  const publicKey = (req as any).publicKey as Uint8Array | undefined;
  const encryptMode = req.headers["x-encrypt-response"] === "true" || 
                      req.headers["x-neotoma-encrypted"] === "true";

  if (encryptMode && publicKey) {
    (res as any).json = function(data: unknown) {
      encryptResponse(data, publicKey)
        .then(encrypted => {
          return originalJson({ encryptedPayload: encrypted });
        })
        .catch(error => {
          console.error("Error encrypting response:", error);
          return originalJson({ error: "Failed to encrypt response" });
        });
      return res;
    };
  }

  next();
}

