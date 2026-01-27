import {
  lua
} from "./chunk-3OZC7A75.js";
import {
  markupTemplating
} from "./chunk-B6SHGCG4.js";

// node_modules/refractor/lang/etlua.js
etlua.displayName = "etlua";
etlua.aliases = [];
function etlua(Prism) {
  Prism.register(lua);
  Prism.register(markupTemplating);
  (function(Prism2) {
    Prism2.languages.etlua = {
      delimiter: {
        pattern: /^<%[-=]?|-?%>$/,
        alias: "punctuation"
      },
      "language-lua": {
        pattern: /[\s\S]+/,
        inside: Prism2.languages.lua
      }
    };
    Prism2.hooks.add("before-tokenize", function(env) {
      var pattern = /<%[\s\S]+?%>/g;
      Prism2.languages["markup-templating"].buildPlaceholders(
        env,
        "etlua",
        pattern
      );
    });
    Prism2.hooks.add("after-tokenize", function(env) {
      Prism2.languages["markup-templating"].tokenizePlaceholders(env, "etlua");
    });
  })(Prism);
}

export {
  etlua
};
//# sourceMappingURL=chunk-ANM324ET.js.map
