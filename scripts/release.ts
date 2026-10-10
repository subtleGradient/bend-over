import { mkdtemp, readdir, rm, mkdir } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import config from "../release.config.json";
import pin from "../toolchain.json";
import { ROOT, run } from "./release/process.ts";
import { assertToolchain } from "./release/toolchain.ts";
import { hubHash, canonical } from "./release/package.ts";
import { bundle } from "./release/bundle.ts";
import { inspect, release, receiptFor, type Candidate } from "./release/core.ts";
import { Remote } from "./release/remote.ts";
import { verifyConsumers, verifyAssets } from "./release/verify.ts";

export async function prepare(id: keyof typeof config.packages, source: string): Promise<Candidate> {
  const pkg=config.packages[id], dir=dirname(join(ROOT,pkg.entry));
  const version=(await Bun.file(join(dir,"VERSION")).text()).trim();
  if(!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){3}$/.test(version))throw new Error(`Invalid VERSION for ${id}`);
  const cache=await mkdtemp(join(tmpdir(),"bend-release-deps-"));
  try {
    const env={BEND_LIB:cache,BEND_SOURCE:source,BEND_HUB:config.hub};
    const files=JSON.parse(await run(["bun","scripts/release/package.ts",pkg.entry,source],{env}));
    if(!files.LICENSE)throw new Error(`Missing package LICENSE for ${id}`);
    const dependencies:Record<string,string>={};
    for(const name of await readdir(join(cache,"names")).catch(()=>[]))dependencies[name]=(await Bun.file(join(cache,"names",name)).text()).trim();
    if(canonical(dependencies)!==canonical(pkg.dependencies))throw new Error(`Dependency hashes changed for ${id}; review release.config.json`);
    const partial={name:pkg.name,version,entry:basename(pkg.entry),commit:await run(["git","rev-parse","HEAD"]),files,dependencies,
      toolchain:{bend:pin.bend.version,source:pin.bend.source,bun:pin.bun,sqliteWasm:"3.53.4-build1"}};
    return {...partial,assets:await bundle(id,partial,source)};
  } finally {await rm(cache,{recursive:true,force:true});}
}

async function main() {
  const args=process.argv.slice(2), publish=args[0]==="publish";
  if(!["check","publish"].includes(args[0]))throw new Error("Usage: bun scripts/release.ts check|publish [js-eval|math-dsl|sqlite]");
  const ids=args.slice(1).length?args.slice(1):Object.keys(config.packages);
  if(ids.some(id=>!(id in config.packages)) || new Set(ids).size!==ids.length)throw new Error("Choose js-eval, math-dsl, sqlite, or omit the package argument");
  const source=resolve(process.env.BEND_SOURCE??join(ROOT,".refs/bend"));
  await assertToolchain(source,process.env.BEND_CLI??"bend");
  if(publish&&(await run(["git","status","--porcelain"])))throw new Error("Publish requires a clean committed checkout");
  const env={BEND_SOURCE:source,BEND_LIB:join(ROOT,".cache/release-tests"),BEND_HUB:config.hub};
  for(const proof of [...ids.map(id=>config.packages[id as keyof typeof config.packages].proof),"demos/js-effects/PROOF.bend"])
    console.log(await run([process.env.BEND_CLI??"bend",proof],{env}));
  console.log("Running repository integration tests...");
  console.log(await run(["bun","test"],{env,quiet:false}));
  const candidates:Candidate[]=[];
  const port=new Remote({hub:config.hub,repository:config.repository,command:args=>run(args,{env}),
    entry:c=>join(ROOT,".cache/releases",`${c.name}-${c.version}`,"hub",c.entry),
    verify:(c,reference)=>verifyConsumers(c,reference,source,config.hub),verifyAssets});
  for(const id of ids) {
    const c=await prepare(id as keyof typeof config.packages,source);candidates.push(c);
    console.log(`${c.name}@${c.version}: ${hubHash(c.files)}\n  ${Object.keys(c.files).sort().join("\n  ")}`);
    await inspect(c,port);
    await verifyConsumers(c,hubHash(c.files),source,config.hub,true);
    await verifyAssets(c,c.assets);
    const out=join(ROOT,".cache/releases",`${c.name}-${c.version}`);await mkdir(out,{recursive:true});
    for(const [name,text] of Object.entries(c.files))await Bun.write(join(out,"hub",name),text);
    for(const [name,data] of Object.entries(c.assets))await Bun.write(join(out,name),data);
    await Bun.write(join(out,"release.json"),JSON.stringify(receiptFor(c),null,2)+"\n");
    console.log(`Prepared ${out}`);
  }
  if(!publish){console.log("Check passed. No public writes. Merge a VERSION bump to release.");return;}
  if(await run(["git","status","--porcelain"]))throw new Error("Checkout changed during release checks; commit changes and rerun");
  // No package is uploaded until every selected package passes authentication and name checks.
  for(const c of candidates)await port.preflight(c);
  for(const c of candidates) {
    const receipt=await release(c,port);
    const summary=`Released ${c.name}@${c.version}\nimport ${c.name}@${c.version}/${c.entry} as Package\nHash: ${receipt.hash}\nSource: ${receipt.commit}\n`;
    console.log(summary);
    if(process.env.GITHUB_STEP_SUMMARY)await Bun.write(process.env.GITHUB_STEP_SUMMARY,
      (await Bun.file(process.env.GITHUB_STEP_SUMMARY).text().catch(()=>""))+"\n```text\n"+summary+"```\n");
  }
}
if(import.meta.main)main().catch(error=>{console.error(error.message);process.exitCode=1;});
