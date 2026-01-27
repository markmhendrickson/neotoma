import {
  json
} from "./chunk-KCICPVP5.js";

// node_modules/refractor/lang/jsonp.js
jsonp.displayName = "jsonp";
jsonp.aliases = [];
function jsonp(Prism) {
  Prism.register(json);
  Prism.languages.jsonp = Prism.languages.extend("json", {
    punctuation: /[{}[\]();,.]/
  });
  Prism.languages.insertBefore("jsonp", "punctuation", {
    function: /(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*\()/
  });
}

export {
  jsonp
};
//# sourceMappingURL=chunk-LXVZ6SJ2.js.map
