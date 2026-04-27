{
  "targets": [
    {
      "target_name": "aauth_win_tbs",
      "conditions": [
        ["OS==\"win\"", {
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
            "NAPI_DISABLE_CPP_EXCEPTIONS",
            "_UNICODE",
            "UNICODE"
          ],
          "libraries": [
            "tbs.lib",
            "ncrypt.lib",
            "crypt32.lib",
            "bcrypt.lib"
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
