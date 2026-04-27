{
  "targets": [
    {
      "target_name": "aauth_mac_se",
      "conditions": [
        ["OS==\"mac\"", {
          "sources": [
            "src/native/binding.mm"
          ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').gyp\")"
          ],
          "defines": [
            "NAPI_DISABLE_CPP_EXCEPTIONS"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_LDFLAGS": [
              "-framework Security",
              "-framework Foundation",
              "-framework CoreFoundation"
            ]
          }
        }]
      ]
    }
  ]
}
