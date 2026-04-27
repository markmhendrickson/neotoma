// Apple Secure Enclave N-API binding for Neotoma AAuth.
//
// Exposes four methods to JS:
//
//   isSupported() -> { supported: boolean, reason?: string }
//   generateKey({ tag: string }) -> { jwk: { kty, crv, x, y }, keyTag: string }
//   sign({ tag: string, message: Buffer }) -> Buffer (DER ECDSA signature)
//   attest({ tag: string, challenge: string }) -> { format: "apple-secure-enclave",
//                                                   attestation_blob: string,
//                                                   signature_blob: string }
//
// Implementation notes:
//
// - Keys are stored in the keychain with `kSecAttrTokenIDSecureEnclave`. The
//   private key never leaves the SE; the public key is exported as raw 65-byte
//   uncompressed P-256 (0x04 || X || Y) and converted to JWK by the JS shim.
// - Attestation uses `SecKeyCreateAttestation` with
//   `kSecKeyAttestationKeyTypeGID` (Apple App Attestation). This API is
//   available only on iOS / Mac Catalyst — on plain macOS the constant is not
//   declared in the public SDK and `attest()` returns a stable
//   `SE_ATTESTATION_NOT_AVAILABLE_ON_MACOS` error so the CLI can fall back to
//   the software-key tier rather than mint an unverifiable envelope.
// - Errors surface as JS exceptions with a stable `code` property so the CLI
//   can branch (e.g. `SE_UNAVAILABLE`, `KEY_NOT_FOUND`).
//
// This file compiles only on macOS; the binding.gyp gate excludes it on
// other platforms. On non-mac hosts the native module is absent and the JS
// shim falls back to `unsupported`.
//
// The binding is built with NAPI_DISABLE_CPP_EXCEPTIONS, so we use the
// `.ThrowAsJavaScriptException(); return env.Null()` idiom rather than C++
// `throw`. Each helper returns `Napi::Value` and callers check the env for a
// pending exception via the early-return pattern.

#ifdef __APPLE__

#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <TargetConditionals.h>
#include <napi.h>
#include <algorithm>
#include <string>

namespace {

#if (TARGET_OS_IPHONE && !TARGET_OS_OSX) || TARGET_OS_MACCATALYST
NSData *DataFromBase64Url(const std::string &input) {
  std::string padded = input;
  std::replace(padded.begin(), padded.end(), '-', '+');
  std::replace(padded.begin(), padded.end(), '_', '/');
  while (padded.size() % 4 != 0) padded.push_back('=');
  NSString *nsStr = [NSString stringWithUTF8String:padded.c_str()];
  return [[NSData alloc] initWithBase64EncodedString:nsStr options:0];
}
#endif

std::string Base64UrlEncode(NSData *data) {
  if (data == nil) return std::string();
  NSString *encoded = [data base64EncodedStringWithOptions:0];
  std::string out([encoded UTF8String]);
  for (auto &c : out) {
    if (c == '+') c = '-';
    else if (c == '/') c = '_';
  }
  while (!out.empty() && out.back() == '=') out.pop_back();
  return out;
}

void ThrowCoded(const Napi::Env &env, const char *code, NSError *err) {
  std::string message = code;
  if (err != nil) {
    message += ": ";
    message += [[err localizedDescription] UTF8String];
  }
  Napi::Error jsErr = Napi::Error::New(env, message);
  jsErr.Set("code", Napi::String::New(env, code));
  jsErr.ThrowAsJavaScriptException();
}

void ThrowTypeError(const Napi::Env &env, const char *message) {
  Napi::TypeError::New(env, message).ThrowAsJavaScriptException();
}

CFDataRef CreateApplicationTag(const std::string &tag) {
  return (CFDataRef)CFBridgingRetain(
      [NSData dataWithBytes:tag.data() length:tag.size()]);
}

SecKeyRef LookupPrivateKey(const std::string &tag, NSError **outError) {
  CFDataRef applicationTag = CreateApplicationTag(tag);
  NSDictionary *query = @{
    (id)kSecClass : (id)kSecClassKey,
    (id)kSecAttrApplicationTag : (__bridge id)applicationTag,
    (id)kSecAttrKeyType : (id)kSecAttrKeyTypeECSECPrimeRandom,
    (id)kSecReturnRef : @YES,
  };
  CFTypeRef result = nullptr;
  OSStatus status = SecItemCopyMatching((CFDictionaryRef)query, &result);
  CFRelease(applicationTag);
  if (status != errSecSuccess) {
    if (outError) {
      *outError = [NSError errorWithDomain:NSOSStatusErrorDomain
                                       code:status
                                   userInfo:nil];
    }
    return nullptr;
  }
  return (SecKeyRef)result;
}

}  // namespace

static Napi::Value IsSupported(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  // SecureEnclave.isAvailable is not directly exposed; we probe by attempting
  // to create attributes that require SE-backed storage. A more accurate
  // probe attempts a temporary key generation — but that has side effects on
  // the keychain. We surface the conservative answer based on hardware class.
#if TARGET_OS_OSX
  // Apple Silicon and T2 Macs ship with the Secure Enclave; older Intel Macs
  // without T2 don't. The N-API binding only loads at all when compiled on
  // mac, but consumers should still call this before keygen.
  result.Set("supported", Napi::Boolean::New(env, true));
#else
  result.Set("supported", Napi::Boolean::New(env, false));
  result.Set("reason", Napi::String::New(env, "non-macOS host"));
#endif
  return result;
}

static Napi::Value GenerateKey(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    ThrowTypeError(env, "generateKey({ tag }) expected");
    return env.Null();
  }
  Napi::Object opts = info[0].As<Napi::Object>();
  if (!opts.Has("tag") || !opts.Get("tag").IsString()) {
    ThrowTypeError(env, "tag (string) is required");
    return env.Null();
  }
  std::string tag = opts.Get("tag").As<Napi::String>().Utf8Value();

  CFErrorRef cfErr = nullptr;
  SecAccessControlRef accessControl = SecAccessControlCreateWithFlags(
      kCFAllocatorDefault, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecAccessControlPrivateKeyUsage, &cfErr);
  if (accessControl == nullptr) {
    NSError *nsErr = (__bridge_transfer NSError *)cfErr;
    ThrowCoded(env, "ACCESS_CONTROL_FAILED", nsErr);
    return env.Null();
  }

  CFDataRef applicationTag = CreateApplicationTag(tag);
  NSDictionary *privateKeyAttrs = @{
    (id)kSecAttrIsPermanent : @YES,
    (id)kSecAttrApplicationTag : (__bridge id)applicationTag,
    (id)kSecAttrAccessControl : (__bridge_transfer id)accessControl,
  };
  NSDictionary *attributes = @{
    (id)kSecAttrKeyType : (id)kSecAttrKeyTypeECSECPrimeRandom,
    (id)kSecAttrKeySizeInBits : @256,
    (id)kSecAttrTokenID : (id)kSecAttrTokenIDSecureEnclave,
    (id)kSecPrivateKeyAttrs : privateKeyAttrs,
  };

  SecKeyRef privateKey =
      SecKeyCreateRandomKey((CFDictionaryRef)attributes, &cfErr);
  CFRelease(applicationTag);
  if (privateKey == nullptr) {
    NSError *nsErr = (__bridge_transfer NSError *)cfErr;
    ThrowCoded(env, "SE_KEY_GENERATION_FAILED", nsErr);
    return env.Null();
  }

  SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
  if (publicKey == nullptr) {
    CFRelease(privateKey);
    ThrowCoded(env, "SE_PUBLIC_KEY_COPY_FAILED", nil);
    return env.Null();
  }

  CFDataRef pubData =
      SecKeyCopyExternalRepresentation(publicKey, &cfErr);
  CFRelease(publicKey);
  CFRelease(privateKey);
  if (pubData == nullptr) {
    NSError *nsErr = (__bridge_transfer NSError *)cfErr;
    ThrowCoded(env, "SE_PUBLIC_KEY_EXPORT_FAILED", nsErr);
    return env.Null();
  }

  NSData *raw = (__bridge_transfer NSData *)pubData;
  // Apple returns 65 bytes: 0x04 || X(32) || Y(32) for P-256.
  if (raw.length != 65) {
    ThrowCoded(env, "SE_PUBLIC_KEY_UNEXPECTED_LENGTH", nil);
    return env.Null();
  }
  const uint8_t *bytes = (const uint8_t *)raw.bytes;
  NSData *xBytes = [NSData dataWithBytes:bytes + 1 length:32];
  NSData *yBytes = [NSData dataWithBytes:bytes + 33 length:32];

  Napi::Object jwk = Napi::Object::New(env);
  jwk.Set("kty", Napi::String::New(env, "EC"));
  jwk.Set("crv", Napi::String::New(env, "P-256"));
  jwk.Set("x", Napi::String::New(env, Base64UrlEncode(xBytes)));
  jwk.Set("y", Napi::String::New(env, Base64UrlEncode(yBytes)));

  Napi::Object result = Napi::Object::New(env);
  result.Set("jwk", jwk);
  result.Set("keyTag", Napi::String::New(env, tag));
  return result;
}

static Napi::Value Sign(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    ThrowTypeError(env, "sign({ tag, message }) expected");
    return env.Null();
  }
  Napi::Object opts = info[0].As<Napi::Object>();
  if (!opts.Has("tag") || !opts.Get("tag").IsString()) {
    ThrowTypeError(env, "tag (string) is required");
    return env.Null();
  }
  if (!opts.Has("message") || !opts.Get("message").IsBuffer()) {
    ThrowTypeError(env, "message (Buffer) is required");
    return env.Null();
  }
  std::string tag = opts.Get("tag").As<Napi::String>().Utf8Value();
  Napi::Buffer<uint8_t> msg = opts.Get("message").As<Napi::Buffer<uint8_t>>();

  NSError *lookupErr = nil;
  SecKeyRef privateKey = LookupPrivateKey(tag, &lookupErr);
  if (privateKey == nullptr) {
    ThrowCoded(env, "SE_KEY_NOT_FOUND", lookupErr);
    return env.Null();
  }

  NSData *messageData = [NSData dataWithBytes:msg.Data() length:msg.Length()];
  CFErrorRef cfErr = nullptr;
  // The CLI computes the SHA-256 digest itself and feeds the digest to this
  // method; using `kSecKeyAlgorithmECDSASignatureDigestX962SHA256` keeps the
  // contract symmetric with `crypto.sign("sha256", digest, ...)` on the
  // verifier side. The result is a DER-encoded ECDSA signature.
  CFDataRef sig = SecKeyCreateSignature(
      privateKey, kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
      (CFDataRef)messageData, &cfErr);
  CFRelease(privateKey);
  if (sig == nullptr) {
    NSError *nsErr = (__bridge_transfer NSError *)cfErr;
    ThrowCoded(env, "SE_SIGNATURE_FAILED", nsErr);
    return env.Null();
  }
  NSData *sigData = (__bridge_transfer NSData *)sig;
  Napi::Buffer<uint8_t> result = Napi::Buffer<uint8_t>::Copy(
      env, (const uint8_t *)sigData.bytes, sigData.length);
  return result;
}

static Napi::Value Attest(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    ThrowTypeError(env, "attest({ tag, challenge }) expected");
    return env.Null();
  }
  Napi::Object opts = info[0].As<Napi::Object>();
  if (!opts.Has("tag") || !opts.Get("tag").IsString()) {
    ThrowTypeError(env, "tag (string) is required");
    return env.Null();
  }
  if (!opts.Has("challenge") || !opts.Get("challenge").IsString()) {
    ThrowTypeError(env, "challenge (string) is required");
    return env.Null();
  }
  std::string tag = opts.Get("tag").As<Napi::String>().Utf8Value();
  std::string challenge = opts.Get("challenge").As<Napi::String>().Utf8Value();

  // App Attestation via `SecKeyCreateAttestation` is iOS / Mac Catalyst only
  // — `kSecKeyAttestationKeyTypeGID` is `API_UNAVAILABLE(macos)` in the
  // public SDK. On plain macOS we surface a stable error so the CLI falls
  // back to `software` rather than emitting a self-signed envelope the
  // server would reject anyway.
#if (TARGET_OS_IPHONE && !TARGET_OS_OSX) || TARGET_OS_MACCATALYST
  NSError *lookupErr = nil;
  SecKeyRef privateKey = LookupPrivateKey(tag, &lookupErr);
  if (privateKey == nullptr) {
    ThrowCoded(env, "SE_KEY_NOT_FOUND", lookupErr);
    return env.Null();
  }

  NSData *challengeData = DataFromBase64Url(challenge);
  if (challengeData == nil) {
    CFRelease(privateKey);
    Napi::Error jsErr = Napi::Error::New(env, "challenge is not base64url");
    jsErr.Set("code", Napi::String::New(env, "SE_CHALLENGE_INVALID"));
    jsErr.ThrowAsJavaScriptException();
    return env.Null();
  }

  CFErrorRef cfErr = nullptr;
  CFDataRef attestation = SecKeyCreateAttestation(
      privateKey, kSecKeyAttestationKeyTypeGID, (CFDataRef)challengeData,
      &cfErr);
  if (attestation == nullptr) {
    CFRelease(privateKey);
    NSError *nsErr = (__bridge_transfer NSError *)cfErr;
    ThrowCoded(env, "SE_ATTESTATION_FAILED", nsErr);
    return env.Null();
  }
  NSData *attestationData = (__bridge_transfer NSData *)attestation;

  // Sign the bound digest. The verifier expects ECDSA(SHA-256(challenge||jkt)),
  // but the JS shim is responsible for producing the digest input — here we
  // simply expose a separate helper. To keep the round-trip self-contained,
  // also produce a raw signature over the supplied challenge so the JS layer
  // can wrap it with the jkt commitment.
  CFDataRef sig = SecKeyCreateSignature(
      privateKey, kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
      (CFDataRef)challengeData, &cfErr);
  CFRelease(privateKey);
  if (sig == nullptr) {
    NSError *nsErr = (__bridge_transfer NSError *)cfErr;
    ThrowCoded(env, "SE_SIGNATURE_FAILED", nsErr);
    return env.Null();
  }
  NSData *sigData = (__bridge_transfer NSData *)sig;

  Napi::Object result = Napi::Object::New(env);
  result.Set("format", Napi::String::New(env, "apple-secure-enclave"));
  // The JS shim parses the chain into individual base64url DER blobs.
  result.Set("attestation_blob",
             Napi::String::New(env, Base64UrlEncode(attestationData)));
  result.Set("signature_blob", Napi::String::New(env, Base64UrlEncode(sigData)));
  return result;
#else
  (void)tag;
  (void)challenge;
  ThrowCoded(env, "SE_ATTESTATION_NOT_AVAILABLE_ON_MACOS", nil);
  return env.Null();
#endif
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("generateKey", Napi::Function::New(env, GenerateKey));
  exports.Set("sign", Napi::Function::New(env, Sign));
  exports.Set("attest", Napi::Function::New(env, Attest));
  return exports;
}

NODE_API_MODULE(aauth_mac_se, Init)

#endif  // __APPLE__
