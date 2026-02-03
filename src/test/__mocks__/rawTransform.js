// Transform .cjs and .mjs files to return their content as a string (default export)
// This handles Vite's ?raw imports in Jest tests
module.exports = {
  process(sourceText) {
    return {
      code: `module.exports = { default: ${JSON.stringify(sourceText)} };`,
    };
  },
};
