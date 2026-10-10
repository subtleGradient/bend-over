import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { deterministicArchive, hubHash, sha256 } from "./package.ts";
import { ROOT, run } from "./process.ts";
import type { Candidate } from "./core.ts";

export function consumerSource(text: string, reference: string, entry: string) {
  // Only rewrite the package under test; other dependencies retain exact Hub imports.
  return text.replace(/^import (\.\.?\/\S+) as (\w+)$/gm, (line, path, alias) =>
    basename(path) === entry ? `import ${reference}/${entry} as ${alias}` : line);
}
export async function seed(files: Record<string,string>, lib: string) {
  const hash=hubHash(files);
  for(const [path,text] of Object.entries(files)) await Bun.write(join(lib,hash,path),text);
  return hash;
}
export async function bundle(id: string, c: Omit<Candidate,"assets">, source: string) {
  const work=await mkdtemp(join(tmpdir(),"bend-bundle-"));
  const files: Record<string,Uint8Array>={};
  const copy=async (from:string,to:string) => {files[to]=await Bun.file(join(ROOT,from)).bytes();};
  const put=(path:string,text:string) => {files[path]=Buffer.from(text);};
  try {
    for(const name of ["README.md","LICENSE","VERSION","LAWS.bend","PROOF.bend"])
      await copy(`packages/${id}/${name}`,name);
    for(const [name,text] of Object.entries(c.files)) put(name,text);
    if(id==="sqlite") {
      await copy("packages/sqlite/host.js","host.js");
      await copy("packages/browser-io/runner.js","runner.js");
      await copy("packages/sqlite/THIRD_PARTY_NOTICES.md","THIRD_PARTY_NOTICES.md");
      for(const name of await readdir(join(ROOT,"packages/sqlite/licenses"))) await copy(`packages/sqlite/licenses/${name}`,`licenses/${name}`);
      for(const name of ["node.mjs","index.mjs","sqlite3.wasm"])
        await copy(`node_modules/@sqlite.org/sqlite-wasm/dist/${name}`,`vendor/${name}`);
      for(const [host,module] of [["bun","node"],["browser","index"]])
        put(`${host}.js`,`import initModule from './vendor/${module}.mjs';\nimport {initializeSQLite as initialize} from './host.js';\nexport const initializeSQLite = (options = {}) => initialize({...options, initModule});\n`);
      put("launch.js",`import {resolve} from 'node:path';\nimport {pathToFileURL} from 'node:url';\nimport {initializeSQLite} from './bun.js';\nconst file=process.argv[2];\nif(!file) throw new Error('Usage: bun launch.js compiled-program.js [args]');\nconst host=await initializeSQLite();\nprocess.argv=[process.argv[0],resolve(file),...process.argv.slice(3)];\ntry {await import(pathToFileURL(resolve(file)).href);} finally {host.dispose();}\n`);
      const lib=join(work,"lib"), hash=await seed(c.files,lib);
      const counter=consumerSource(await Bun.file(join(ROOT,"packages/sqlite/examples/counter.bend")).text(),hash,c.entry);
      await Bun.write(join(work,"counter.bend"),counter);
      await Bun.write(join(work,"contract.bend"),consumerSource(await Bun.file(join(ROOT,"tests/fixtures/sqlite/contract.bend")).text(),hash,c.entry));
      for(const [entry,kind,target] of [["counter","cli","counter.js"],["counter","counter","web/counter.js"],["contract","contract","web/contract.js"]]) {
        const output=join(work,target);
        await run(["bun",join(ROOT,"scripts/release/compile.ts"),join(work,entry+".bend"),output,kind],{env:{BEND_SOURCE:source,BEND_LIB:lib}});
        files[target]=await Bun.file(output).bytes();
      }
      put("examples/counter.bend",consumerSource(counter,`${c.name}@${c.version}`,c.entry).replace(`import ${hash}/`, `import ${c.name}@${c.version}/`));
      for(const name of ["index.html","client.js","worker.js"]) {
        let text=await Bun.file(join(ROOT,"packages/sqlite/examples/web",name)).text();
        if(name==="worker.js") text=text.replace('import sqlite3InitModule from "./vendor/index.mjs";\n',"")
          .replace('from "./host.js"','from "../browser.js"').replace(", initModule: sqlite3InitModule","");
        put("web/"+name,text);
      }
      put("serve.js",`import {resolve,sep} from 'node:path';\nconst root=import.meta.dir;\nconst server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT??3001),async fetch(req){\nlet path;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url).pathname));}catch{return new Response('Bad path',{status:400});}\nif(path===root)path=resolve(root,'web/index.html');\nif(!path.startsWith(root+sep))return new Response('Not found',{status:404});\nconst file=Bun.file(path);return await file.exists()?new Response(file):new Response('Not found',{status:404});}});\nconsole.log(server.url+'web/');\n`);
      // Relative page modules work at /web/; serve.js also maps directory requests.
      files["serve.js"]=Buffer.from(Buffer.from(files["serve.js"]).toString().replace("if(path===root)path=resolve(root,'web/index.html');","if(path===root||path===resolve(root,'web'))path=resolve(root,'web/index.html');"));
      put("QUICKSTART.md",`# ${c.name} ${c.version}\n\nExtract this archive anywhere. Requires Bun ${c.toolchain.bun}; no npm install.\n\n- Run: \`bun launch.js counter.js\`\n- Browser: \`bun serve.js\`, then open http://127.0.0.1:3001/web/\n- Your compiled Bend program: \`bun launch.js /path/to/program.js\`\n- Bun initializer: import \`initializeSQLite\` from \`./bun.js\`.\n- Browser worker initializer: import it from \`./browser.js\` and pass \`{persistent:true}\`.\n\nBend import: \`import ${c.name}@${c.version}/${c.entry} as SQLite\`\nHash alternative: \`import ${hash}/${c.entry} as SQLite\`\n\nKeep vendor assets beside the initializer modules and serve them locally. See README.md for API and host differences.\n`);
    } else {
      put("example.bend",consumerSource(await Bun.file(join(ROOT,`packages/${id}/example.bend`)).text(),`${c.name}@${c.version}`,c.entry));
    }
    const name=`${c.name}-${c.version}.tar.gz`;
    const bytes=deterministicArchive(files);
    return { [name]:bytes, "SHA256SUMS":Buffer.from(`${sha256(bytes)}  ${name}\n`) };
  } finally {await rm(work,{recursive:true,force:true});}
}
