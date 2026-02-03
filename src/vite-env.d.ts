/// <reference types="vite/client" />

declare module '*.cjs?raw' {
  const content: string;
  export default content;
}

declare module '*.mjs?raw' {
  const content: string;
  export default content;
}
