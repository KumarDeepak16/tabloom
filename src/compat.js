// Firefox's promise-based API lives on `browser`. Imported first, so every module can use `chrome`.
if (globalThis.browser?.runtime) globalThis.chrome = globalThis.browser;
