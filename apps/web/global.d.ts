// Side-effect CSS imports (e.g. `import "@workspace/ui/globals.css"`) carry no
// TypeScript types. Declaring the wildcard module makes them valid untyped
// modules so the editor's TS server doesn't raise TS2882. The bundler
// (Next/Turbopack) handles the actual CSS via the package `exports` map.
declare module "*.css"
