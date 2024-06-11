import fs from 'node:fs/promises';

type ModuleType = 'cjs' | 'mjs';

const moduleTypes = {
  cjs: {
    type: 'commonjs',
    outputPath: 'dist/cjs',
  },
  mjs: {
    type: 'module',
    outputPath: 'dist/mjs',
  },
} as const;

const types: ModuleType[] = ['cjs', 'mjs'];

async function main() {
  const pkgString = await fs.readFile(`./package.json`, { encoding: 'utf-8' });
  const packageJson = JSON.parse(pkgString);

  for (const type of types) {
    const moduleType = moduleTypes[type];
    const pkg = {
      ...packageJson,
      type: moduleType.type,
    };

    await fs.mkdir(moduleType.outputPath, { recursive: true });
    await fs.writeFile(`${moduleType.outputPath}/package.json`, JSON.stringify(pkg, null, 2));
  }
}

main();
