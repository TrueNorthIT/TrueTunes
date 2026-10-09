{
  "targets": [
    {
      "target_name": "smtc",
      "sources": [ "src/smtc_addon.cpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [ "NAPI_VERSION=8" ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [ "WindowsApp.lib", "Shell32.lib", "Propsys.lib", "Ole32.lib" ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [ "/std:c++20", "/EHsc" ],
              "ExceptionHandling": 1
            }
          }
        }]
      ]
    }
  ]
}
