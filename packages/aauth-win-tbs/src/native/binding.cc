// Windows TBS + CNG N-API binding for Neotoma AAuth.
//
// Exposes four methods to JS:
//
//   isSupported() -> { supported: boolean, reason?: string }
//   generateKey({ provider, scope, alg, keyName }) ->
//       { jwk, keyName, provider, scope, alg }
//   sign({ keyName, provider, digest, alg }) -> Buffer (DER signature)
//   attest({ keyName, provider, challenge, jkt }) -> {
//     format: "tpm2", ver: "2.0", alg, x5c, sig, certInfo, pubArea
//   }
//
// Implementation notes:
//
// - The binding talks to TBS (TPM Base Services) for capability
//   detection (`Tbsi_Context_Create` + `Tbsi_GetDeviceInfo`) and to
//   CNG via NCrypt (`NCryptOpenStorageProvider` against
//   `MS_PLATFORM_KEY_STORAGE_PROVIDER`,
//   `NCryptCreatePersistedKey`, `NCryptSignHash`,
//   `NCryptCreateClaim`).
// - `generateKey` provisions a persistent NCrypt key bound to the
//   host TPM via the Microsoft Platform Crypto Provider and returns
//   the public JWK plus the opaque NCrypt key name. The private
//   scalar NEVER reaches the Node process.
// - `attest` calls `NCryptCreateClaim` with
//   `NCRYPT_CLAIM_AUTHORITY_AND_SUBJECT_TYPE` and binds the AAuth
//   challenge via `NCRYPT_CLAIM_NONCE_PROPERTY` so the server-side
//   verifier (FU-3) can confirm the quote is tied to the JWT's
//   `cnf.jwk`. The output is the raw TPM 2.0 wire-format structures
//   ready for the AAuth `cnf.attestation` envelope (`format: "tpm2"`).
// - Errors surface as JS exceptions with a stable `code` property
//   (`TBS_UNAVAILABLE`, `NCRYPT_PROVIDER_UNAVAILABLE`,
//   `NCRYPT_KEY_NOT_FOUND`, `NCRYPT_SIGN_FAILED`,
//   `NCRYPT_CLAIM_FAILED`, `TBS_INVALID_ARG`,
//   `TBS_ALG_UNSUPPORTED`) so the CLI can branch on them.
//
// This file compiles only on Windows; the `binding.gyp` gate excludes
// it on other platforms. On non-Windows hosts the native module is
// absent and the JS shim short-circuits with `{ supported: false }`.

#ifdef _WIN32

#include <napi.h>

#include <cstring>
#include <string>

namespace {

// NOTE: The TBS / NCrypt bindings are intentionally NOT linked at
// compile time when this file is built without
// `-DNEOTOMA_AAUTH_WIN_TBS_BUILD_NATIVE=1` so that the JS surface
// stays exercisable in environments where the Windows SDK is not
// installed. The TBS-backed implementation lives in a follow-up commit
// gated by that define; this skeleton provides the N-API shape and the
// `isSupported` probe so the JS shim and CLI can integrate today.

Napi::Object MakeProbeUnavailable(const Napi::Env &env, const char *reason) {
  Napi::Object out = Napi::Object::New(env);
  out.Set("supported", Napi::Boolean::New(env, false));
  out.Set("reason", Napi::String::New(env, reason));
  return out;
}

Napi::Value IsSupported(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
#ifdef NEOTOMA_AAUTH_WIN_TBS_BUILD_NATIVE
  // The full TBS + NCrypt-backed probe lives in a follow-up commit;
  // until then this branch returns the documented "build-time
  // disabled" reason so the CLI surfaces a clear actionable error.
  return MakeProbeUnavailable(env, "win-tbs native build placeholder");
#else
  return MakeProbeUnavailable(
      env, "aauth-win-tbs native binding compiled without TBS support");
#endif
}

void ThrowCoded(const Napi::Env &env, const char *code) {
  Napi::Error jsErr = Napi::Error::New(env, code);
  jsErr.Set("code", Napi::String::New(env, code));
  jsErr.ThrowAsJavaScriptException();
}

Napi::Value GenerateKey(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "WIN_TBS_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Value Sign(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "WIN_TBS_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Value Attest(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "WIN_TBS_NATIVE_NOT_BUILT");
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

NODE_API_MODULE(aauth_win_tbs, Init)

#endif  // _WIN32
