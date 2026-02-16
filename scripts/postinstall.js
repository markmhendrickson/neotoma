#!/usr/bin/env node

/**
 * Neotoma postinstall script
 *
 * Displays a welcome message after npm install.
 * Does NOT perform critical setup - use `neotoma init` for that.
 *
 * This script is intentionally lightweight because:
 * 1. Many users run `npm install --ignore-scripts` for security
 * 2. CI environments may skip lifecycle scripts
 * 3. Critical setup should be explicit via `neotoma init`
 */

const PACK_RAT = `
         /\\    /\\
        /  \\__/  \\
       (   o  o   )  ___
        \\   ^    /  (   )
         \\_____/    ) (        Neotoma installed successfully!
        /   _   \\  /   \\
       (  ( ) )  )
        \\ /   \\ /  ^   ^
`;

console.log(PACK_RAT);
console.log("Next steps:");
console.log("");
console.log("  1. Run initial setup:");
console.log("     npx neotoma init");
console.log("");
console.log("  2. Start the API server:");
console.log("     npx neotoma api start");
console.log("");
console.log("  3. Configure MCP for Cursor:");
console.log("     npx neotoma mcp config");
console.log("");
console.log("Documentation: https://github.com/markmhendrickson/neotoma#readme");
console.log("");
