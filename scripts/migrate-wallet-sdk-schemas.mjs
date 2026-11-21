import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// These SDK releases still declare Zod 3. Zod 4 requires an explicit key
// schema for records. Preserve the original string-keyed maps and apply the
// change only to the audited files from the pinned npm artifacts.
const modules = fileURLToPath(new URL("../node_modules/", import.meta.url));
const patches = [
  {
    packageName: "x402",
    version: "0.7.3",
    pattern: /(\b[\w.]+)\.record\(\1\.any\(\)\)/g,
    replacement: "$1.record($1.string(), $1.any())",
    files: {
      "dist/esm/chunk-3EQVFRKV.mjs": [
        "375a194a047f75831d3bc0fe556e92cad202770ab682825b56f86a1c8e2caae5",
        "fd32fedb78f080dfb7d6fea19bd474bd74f0ca12c140527a7caa2a015ef838c8"
      ],
      "dist/cjs/index.js": [
        "4ecf3d633ed04e0ddde8ce792845d4b974d99d64d6dd69f9c40dae5780982bb1",
        "75821502d5e0aab36c71d4b2aae7d9d66fd64fd910ae1550627fe753cf68f75c"
      ],
      "dist/cjs/client/index.js": [
        "df1f36874bc93828eabe5cbc5f1c3707f912eec10a29a71c3ef70d1ecd52d0c6",
        "3aa7743acd704cf81357b19c2849d2064f614100a79e60f7cb3ea6d1e5427272"
      ],
      "dist/cjs/facilitator/index.js": [
        "e43851fb74eaff8e7cbbd0eb2933043eb50c4c375911328766f4feb75716e784",
        "ccf5224029394dee61261c1f6ac0bf8c4bc69b6391d748e75d03830e28c97ed3"
      ],
      "dist/cjs/schemes/index.js": [
        "bc16230d3aeaf75f4f1b713464e05418019f768d346b4583b2617c9f57679208",
        "e6cfe6a4a8c3b760ba964c21212f546f2644f55f20e680fab1bb56a3f117a0eb"
      ],
      "dist/cjs/shared/index.js": [
        "12452d688d227869d8951fa51290a32b5fca3f414d292055a7efcaa30887aadd",
        "a0c02eedbca1fa6ef3054bb8260ebd4360d557e6c62c8984d3fb8428d1a51a4a"
      ],
      "dist/cjs/types/index.js": [
        "e75bb6474819dd159acd163975f0544951f3eabcfb6967552f77c235f9f9cf61",
        "3bfd4e9cf277fc7f29b8b30e1ad344d444a816252a5d0211448c57770da7d7be"
      ],
      "dist/cjs/verify/index.js": [
        "67603316f2cdc0dedd3193a89c00ab130e6f11482beaa68ae3027b414d6c7fff",
        "864d5f6819d898171d3a34c9fbd1d782725af7a81b306ce9aaeafde5300e8a5b"
      ]
    },
  },
  {
    packageName: "@coinbase/cdp-sdk",
    version: "1.57.1",
    pattern: /(\b[\w.]+)\.record\(\1\.array\(/g,
    replacement: "$1.record($1.string(), $1.array(",
    files: {
      "_esm/policies/evmSchema.js": [
        "7a3adae0bbae10a06f0f8d9d048ba7d54621b87ec2154d4726efe1233aa0b292",
        "0fd1960b56160d2d84d54617ddf6d304c25067f95e2580300fb6a004be35296a"
      ],
      "_cjs/policies/evmSchema.js": [
        "7b20273d74e5b696fc3585c70ede912e292a32511b24e8b031bc8b44a6a27f6e",
        "60517fc6f3d1ae7a6b473bc10e6d336708cdb669550fafd0cd31ab8143806f89"
      ]
    },
  },
];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const pending = [];
for (const patch of patches) {
  const directory = join(modules, patch.packageName);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (manifest.version !== patch.version) {
    throw new Error(`Revisar compatibilidad Zod de ${patch.packageName}@${manifest.version}`);
  }
  for (const [file, [original, migrated]] of Object.entries(patch.files)) {
    const path = join(directory, file);
    const source = await readFile(path, "utf8");
    const hash = sha256(source);
    if (hash === migrated) continue;
    if (hash !== original) throw new Error(`Archivo SDK inesperado: ${patch.packageName}/${file}`);
    const next = source.replace(patch.pattern, patch.replacement);
    if (sha256(next) !== migrated) throw new Error(`Adaptación SDK incompleta: ${file}`);
    pending.push({ path, next });
  }
}
for (const { path, next } of pending) await writeFile(path, next);
console.log(`SDK de billetera: esquemas Zod 4 verificados (${pending.length} archivos adaptados).`);
