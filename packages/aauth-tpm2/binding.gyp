{
  "targets": [
    {
      "target_name": "aauth_tpm2",
      "conditions": [
        ["OS==\"linux\"", {
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
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "cflags": [
            "-Wall",
            "-Wextra",
            "-Wpedantic"
          ],
          "cflags_cc": [
            "-std=c++17",
            "-fexceptions"
          ],
          "libraries": [
            "-ltss2-esys",
            "-ltss2-mu",
            "-ltss2-rc",
            "-ltss2-tctildr"
          ]
        }]
      ]
    }
  ]
}
