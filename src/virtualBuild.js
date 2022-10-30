const { resolve, basename, dirname } = require("path");
const { writeFile, rm, mkdir } = require("fs/promises");
const { existsSync } = require("fs");

module.exports = class VirtualBuild {
  files = new Map();

  constructor(esbuild, dir) {
    this.esbuild = esbuild;
    this.dir = dir;
  }

  async addFile(filename, cb) {
    this.files.set(resolve(this.dir, filename), cb);
  }

  async createTempFile(content, loader, cb) {
    const filename = `__temp_${Date.now().toString(36)}__.${loader}`;
    const filepath = resolve(this.dir, filename);
    this.files.set(filename, cb);
    await writeFile(filepath, content);
  }

  async run(initialOptions) {
    if (!this.files.size) return;

    const entryPoints = [...this.files.keys()].map(filename => resolve(this.dir, filename));
    const build = await this.esbuild.build({
      ...initialOptions,
      entryPoints,
      write: false
    });

    for (const file of build.outputFiles) {
      const filename = basename(file.path);
      if (this.files.has(filename)) {
        const cb = this.files.get(filename);
        cb(file.text.trim());
        this.files.delete(filename);
        await rm(resolve(this.dir, filename));
      } else {
        if (!existsSync(file.path)) await mkdir(dirname(file.path), { recursive: true });
        await writeFile(file.path, file.contents);
      }
    }
  }
};
