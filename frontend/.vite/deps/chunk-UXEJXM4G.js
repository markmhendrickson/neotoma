// node_modules/refractor/lang/csv.js
csv.displayName = "csv";
csv.aliases = [];
function csv(Prism) {
  Prism.languages.csv = {
    value: /[^\r\n,"]+|"(?:[^"]|"")*"(?!")/,
    punctuation: /,/
  };
}

export {
  csv
};
//# sourceMappingURL=chunk-UXEJXM4G.js.map
