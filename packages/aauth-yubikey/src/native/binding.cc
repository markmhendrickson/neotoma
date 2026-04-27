// YubiKey PKCS#11 + YKPIV_INS_ATTEST N-API binding for Neotoma AAuth.
//
// Exposes four methods to JS:
//
//   isSupported({ pkcs11Path? }) -> { supported: boolean, reason?: string }
//   generateKey({ pkcs11Path?, slot, alg, pin?, serial? }) ->
//       { jwk, slot, alg, serial, pkcs11Path, attestationCert,
//         attestationIntermediate, aaguid }
//   sign({ pkcs11Path?, slot, digest, alg, pin?, serial? }) ->
//       Buffer (DER ECDSA signature)
//   attest({ pkcs11Path?, slot, challenge, jkt, pin?, serial? }) -> {
//     format: "packed", alg, sig, x5c, aaguid
//   }
//
// Implementation notes:
//
// - The binding `dlopen`s (POSIX) / `LoadLibrary`s (Windows)
//   `libykcs11` at runtime; it does NOT link against the Yubico
//   PKCS#11 library at build time so this package builds on hosts
//   without YubiKey Manager / yubico-piv-tool installed.
// - `isSupported` walks a platform-specific list of well-known paths
//   (`/usr/local/lib/libykcs11.so`, `/Library/Yubico/...dylib`,
//   `C:\Program Files\Yubico\...dll`) and honours the
//   `pkcs11Path` override + `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH` env
//   var. It then probes `C_GetSlotList(true, ...)` for at least one
//   YubiKey-shaped slot and confirms firmware >= 5.0.0 via the
//   YubiKey-specific `CK_TOKEN_INFO.firmwareVersion`.
// - `generateKey` calls `C_GenerateKeyPair` with `CKM_EC_KEY_PAIR_GEN`
//   against the YubiKey PKCS#11 slot mapped to PIV slot 9c
//   (`CKA_ID = 0x9c`, `CKA_LABEL = "PIV AUTH key"`). The per-slot
//   attestation cert (chained to Yubico's PIV CA) is fetched via
//   `C_GetAttributeValue(CKA_VALUE)` against the cert object with
//   `CKA_ID = 0xF9`. The private scalar NEVER reaches the Node
//   process.
// - `attest` constructs `clientDataHash = SHA-256(challenge || jkt)`,
//   builds `authenticatorData` per WebAuthn-packed §8.2 (rpIdHash =
//   SHA-256("neotoma.aauth"), flags = 0x01 [user-present], signCount
//   = 0, AAGUID, credentialIdLength, credentialId, credentialPublicKey
//   in COSE_Key form), signs `authenticatorData || clientDataHash`
//   via `C_Sign(CKM_ECDSA)`, and packages the per-slot cert + F9
//   intermediate into the `x5c` array.
// - PIN handling: PIN value MUST never be logged. Errors mention only
//   the PIN policy and remaining attempts, never the PIN itself.
//   Interactive PIN prompt sets stdin to raw mode for echo
//   suppression; non-interactive paths use `pin` option or
//   `NEOTOMA_AAUTH_YUBIKEY_PIN` env var.
// - Errors surface as JS exceptions with a stable `code` property
//   (`YUBIKEY_LIBYKCS11_NOT_LOADABLE`, `YUBIKEY_NO_DEVICE`,
//   `YUBIKEY_FIRMWARE_TOO_OLD`, `YUBIKEY_PIN_LOCKED`,
//   `YUBIKEY_PIN_INVALID`, `YUBIKEY_SERIAL_MISMATCH`,
//   `YUBIKEY_SLOT_UNSUPPORTED`, `YUBIKEY_ATTEST_FAILED`,
//   `YUBIKEY_SIGN_FAILED`) so the CLI can branch on them.
//
// This skeleton provides the N-API shape and the documented
// `isSupported` placeholder so the JS shim and CLI can integrate
// today. The full PKCS#11 / YKPIV_INS_ATTEST implementation lives in
// a follow-up commit gated by the
// `NEOTOMA_AAUTH_YUBIKEY_BUILD_NATIVE` define.

#include <napi.h>

#include <cstring>
#include <string>

namespace {

Napi::Object MakeProbeUnavailable(const Napi::Env &env, const char *reason) {
  Napi::Object out = Napi::Object::New(env);
  out.Set("supported", Napi::Boolean::New(env, false));
  out.Set("reason", Napi::String::New(env, reason));
  return out;
}

Napi::Value IsSupported(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
#ifdef NEOTOMA_AAUTH_YUBIKEY_BUILD_NATIVE
  // The full PKCS#11-backed probe lives in a follow-up commit gated
  // by NEOTOMA_AAUTH_YUBIKEY_BUILD_NATIVE; until then this branch
  // returns the documented "build-time disabled" reason so the CLI
  // surfaces a clear actionable error.
  return MakeProbeUnavailable(env, "yubikey native build placeholder");
#else
  return MakeProbeUnavailable(
      env,
      "aauth-yubikey native binding compiled without PKCS#11 support");
#endif
}

void ThrowCoded(const Napi::Env &env, const char *code) {
  Napi::Error jsErr = Napi::Error::New(env, code);
  jsErr.Set("code", Napi::String::New(env, code));
  jsErr.ThrowAsJavaScriptException();
}

Napi::Value GenerateKey(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "YUBIKEY_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Value Sign(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "YUBIKEY_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Value Attest(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "YUBIKEY_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("generateKey", Napi::Function::New(env, GenerateKey));
  exports.Set("sign", Napi::Function::New(env, Sign));
  exports.Set("attest", Napi::Function::New(env, Attest));
  return exports;
}

}  // namespace

NODE_API_MODULE(aauth_yubikey, Init)
