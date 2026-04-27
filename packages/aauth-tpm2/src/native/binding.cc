// Linux TPM 2.0 N-API binding for Neotoma AAuth.
//
// Exposes four methods to JS:
//
//   isSupported() -> { supported: boolean, reason?: string }
//   generateKey({ hierarchy, alg }) -> { jwk, handle, hierarchy, alg }
//   sign({ handle, digest, alg }) -> Buffer (DER signature)
//   attest({ handle, challenge, jkt }) -> {
//     format: "tpm2", ver: "2.0", alg, x5c, sig, certInfo, pubArea
//   }
//
// Implementation notes:
//
// - The binding talks to libtss2 (tpm2-tss) in-process via the ESYS API
//   over the `tcti-device` transport against `/dev/tpmrm0` (the
//   resource-managed TPM device). It refuses to use raw `/dev/tpm0`
//   unless the resource manager is genuinely absent, to avoid clobbering
//   other consumers' sessions.
// - `generateKey` creates a primary key under the requested hierarchy
//   (Owner by default; Endorsement on opt-in) and persists it under a
//   `0x81000000`-range handle.
// - `attest` issues `TPM2_Quote` (when the bound key is restricted) or
//   `TPM2_Certify` (otherwise) with
//   `qualifyingData = SHA-256(challenge || jkt)`. The returned
//   `certInfo` and `pubArea` are raw TPM 2.0 wire-format structures
//   ready for the AAuth `cnf.attestation` envelope (see FU-3).
// - The TPM-resident private scalar NEVER reaches the Node process. All
//   signing operations route through `Esys_Sign`.
// - Errors surface as JS exceptions with a stable `code` property
//   (`TPM2_UNAVAILABLE`, `TPM2_HANDLE_NOT_FOUND`, `TPM2_QUOTE_FAILED`,
//   `TPM2_INVALID_ARG`, `TPM2_ALG_UNSUPPORTED`) so the CLI can branch on
//   them.
//
// This file compiles only on Linux; the `binding.gyp` gate excludes it
// on other platforms. On non-Linux hosts the native module is absent
// and the JS shim short-circuits with `{ supported: false }`.

#ifdef __linux__

#include <napi.h>

#include <cstring>
#include <string>

namespace {

// NOTE: The TPM 2.0 ESYS bindings are intentionally NOT linked at
// compile time when this file is built without `-DNEOTOMA_AAUTH_TPM2_BUILD_NATIVE=1`
// so that the JS surface stays exercisable in environments where
// libtss2 is not installed. The ESYS-backed implementation lives in a
// follow-up commit gated by that define; this skeleton provides the
// N-API shape and the `isSupported` probe so the JS shim and CLI can
// integrate today.

Napi::Object MakeProbeUnavailable(const Napi::Env &env, const char *reason) {
  Napi::Object out = Napi::Object::New(env);
  out.Set("supported", Napi::Boolean::New(env, false));
  out.Set("reason", Napi::String::New(env, reason));
  return out;
}

Napi::Value IsSupported(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
#ifdef NEOTOMA_AAUTH_TPM2_BUILD_NATIVE
  // The full ESYS-backed probe lives in a follow-up commit; until then
  // this branch returns the documented "build-time disabled" reason so
  // the CLI surfaces a clear actionable error.
  return MakeProbeUnavailable(env, "tpm2 native build placeholder");
#else
  return MakeProbeUnavailable(
      env, "aauth-tpm2 native binding compiled without ESYS support");
#endif
}

void ThrowCoded(const Napi::Env &env, const char *code) {
  Napi::Error jsErr = Napi::Error::New(env, code);
  jsErr.Set("code", Napi::String::New(env, code));
  jsErr.ThrowAsJavaScriptException();
}

Napi::Value GenerateKey(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "TPM2_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Value Sign(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "TPM2_NATIVE_NOT_BUILT");
  return info.Env().Null();
}

Napi::Value Attest(const Napi::CallbackInfo &info) {
  ThrowCoded(info.Env(), "TPM2_NATIVE_NOT_BUILT");
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

NODE_API_MODULE(aauth_tpm2, Init)

#endif  // __linux__
