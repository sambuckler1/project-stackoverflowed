const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/index.jsx"],
  bundle: true,
  outfile: "panel.bundle.js",
  format: "iife",
  loader: {
    ".js": "jsx",
    ".jsx": "jsx",
  },
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
}).catch(() => process.exit(1));
