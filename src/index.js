const { readFile } = require("fs/promises");
const { dirname } = require("path");

const posthtml = require("posthtml");
const htmlnano = require("htmlnano");

const VirtualBuild = require("./virtualBuild");

/** @return {import('esbuild').Plugin} */
module.exports = (plugins, options) => ({
  name: "esbuild-plugin-html",
  setup(ctx) {
    const nano = htmlnano({
      minifyCss: false,
      minifyJs: false,
      collapseWhitespace: "all",
      ...options
    });

    ctx.onLoad({ filter: /\.html$/ }, async args => {
      const html = posthtml(plugins)
        .use(nano)
        .use(async tree => {
          if (ctx.initialOptions.bundle) {
            const queue = [];
            const virtualBuild = new VirtualBuild(ctx.esbuild, dirname(args.path));

            tree.walk(node => {
              queue.push(
                (async () => {
                  if (node.tag === "script" && node.content?.length)
                    await virtualBuild.createTempFile(
                      node.content.join(""),
                      node.attrs?.loader ?? node.attrs?.lang ?? "js",
                      text => (node.content = text)
                    );

                  if (node.tag === "style" && node.content?.length)
                    await virtualBuild.createTempFile(
                      node.content.join(""),
                      node.attrs?.loader ?? node.attrs?.lang ?? "css",
                      text => (node.content = text)
                    );

                  if (node.attrs?.src && !node.attrs.src.startsWith("http")) virtualBuild.addFile(node.attrs.src);
                  if (node.attrs?.href && !node.attrs.href.startsWith("http")) virtualBuild.addFile(node.attrs.href);
                })()
              );

              return node;
            });

            await Promise.all(queue);
            await virtualBuild.run(ctx.initialOptions);
          }
        });

      const result = await html.process(await readFile(args.path, "utf8"));

      return {
        contents: result.html,
        loader: "copy"
      };
    });
  }
});
