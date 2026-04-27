{
  "targets": [
    {
      "target_name": "aauth_yubikey",
      "sources": [
        "src/native/binding.cc"
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
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-std=c++17"],
      "conditions": [
        ["OS==\"linux\"", {
          "libraries": [
            "-ldl"
          ]
        }],
        ["OS==\"mac\"", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          }
        }],
        ["OS==\"win\"", {
          "defines": [
            "_UNICODE",
            "UNICODE"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [
                "/std:c++17",
                "/W4"
              ]
            }
          }
        }]
      ]
    }
  ]
}
