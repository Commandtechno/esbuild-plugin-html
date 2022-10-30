const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["index.html"],
  outdir: "build",
  bundle: true,
  minify: true,
  plugins: [require("..")()],
  loader: {
    ".png": "file",
  },
});
