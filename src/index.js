const { readFile } = require("fs/promises");

const posthtml = require("posthtml");
const htmlnano = require("htmlnano");
const crypto = require("crypto");
const { resolve, dirname } = require("path");

function s(str) {
  return JSON.stringify(str);
}

function getHash(str) {
  return "___" + crypto.createHash("sha256").update(str).digest("hex");
}

function makeImport(src, type) {
  if (!src.startsWith(".") && !src.endsWith("/")) src = "./" + src;

  return {
    src,
    type,
    hash: getHash(src)
  };
}

/** @return {import('esbuild').Plugin} */
module.exports = (plugins, options) => ({
  name: "esbuild-plugin-html",
  async setup(ctx) {
    const { useRna } = await import("@chialab/esbuild-rna");
    const rna = useRna(module.exports, ctx);
    const nano = htmlnano({
      minifyCss: false,
      minifyJs: false,
      collapseWhitespace: "all",
      ...options
    });

    ctx.onLoad({ filter: /\.html$/ }, async args => {
      const imports = [];
      const queue = [];

      const html = posthtml(plugins)
        .use(nano)
        .use(tree => {
          if (ctx.initialOptions.bundle) {
            tree.walk(node => {
              queue.push(
                (async () => {
                  if (node.tag === "script" && node.attrs?.src && node.attrs?.inline) {
                    const build = await rna.emitBuild({ entryPoints: [{ path: node.attrs?.src }] });
                    console.log(build.metafile.inputs, build.metafile.outputs);
                    node.content = _import.hash;
                    delete node.attrs.src;
                    delete node.attrs.inline;
                  } else if (
                    node.tag === "link" &&
                    node.attrs?.rel === "stylesheet" &&
                    node.attrs?.href &&
                    node.attrs?.inline
                  ) {
                    const _import = makeImport(node.attrs.href, "content");
                    imports.push(_import);
                    node.content = _import.hash;
                    node.tag = "style";
                    delete node.attrs.href;
                    delete node.attrs.inline;
                  }
                  // if (node.tag === "style" && node.content?.length)
                  //   await virtualBuild.createTempFile(
                  //     node.content.join(""),
                  //     node.attrs?.loader ?? node.attrs?.lang ?? "css",
                  //     text => (node.content = text)
                  //   );
                  else if (node.attrs?.src && !node.attrs.src.startsWith("http")) {
                    const _import = makeImport(node.attrs.src, "default");
                    imports.push(_import);
                    node.attrs.src = _import.hash;
                  }

                  // if (node.attrs?.href && !node.attrs.href.startsWith("http")) {
                  //   if (node.attrs.href.startsWith("external:"))
                  //     node.attrs.href = node.attrs.href.replace("external:", "");
                  //   else virtualBuild.addFile(node.attrs.href);
                  // }

                  return node;
                })()
              );
            });
          }
        });

      await Promise.all(queue);
      const result = await html.process(await readFile(args.path, "utf8"));

      let body = JSON.stringify(result.html);
      let header = "";

      const cached = new Set();
      for (const { src, type, hash } of imports) {
        if (cached.has(hash)) continue;
        cached.add(hash);

        if (type === "content") {
          header += `import ${s(src)};\nconst ${hash} = __readFile(${s(resolve(dirname(args.path), src))});\n`;
        } else if (type === "default") header += `import ${hash} from ${s(src)};\n`;
        else if (type === "*") header += `import * as ${hash} from ${s(src)};\n`;

        body = body.replaceAll(hash, `" + ${hash} + "`);
      }

      return {
        contents: header + `console.log(${body});`,
        loader: "js"
      };
    });
  }
});
