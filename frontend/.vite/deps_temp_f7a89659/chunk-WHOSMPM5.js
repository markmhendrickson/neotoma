import {
  c
} from "./chunk-3KYPVOMT.js";

// node_modules/refractor/lang/cilkc.js
cilkc.displayName = "cilkc";
cilkc.aliases = ["cilk-c"];
function cilkc(Prism) {
  Prism.register(c);
  Prism.languages.cilkc = Prism.languages.insertBefore("c", "function", {
    "parallel-keyword": {
      pattern: /\bcilk_(?:for|reducer|s(?:cope|pawn|ync))\b/,
      alias: "keyword"
    }
  });
  Prism.languages["cilk-c"] = Prism.languages["cilkc"];
}

export {
  cilkc
};
//# sourceMappingURL=chunk-WHOSMPM5.js.map
