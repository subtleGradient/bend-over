import {test,expect} from "bun:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {run,ROOT} from "../../scripts/release/process.ts";
import {hubHash} from "../../scripts/release/package.ts";
import {prepare} from "../../scripts/release.ts";

for(const id of ["js-eval","math-dsl","sqlite"])test(`collector equals the official publisher for ${id}`,async()=>{
  const cache=await mkdtemp(join(tmpdir(),"bend-publish-test-"));let captured:any=null;
  const server=Bun.serve({hostname:"127.0.0.1",port:0,async fetch(req){
    const path=new URL(req.url).pathname;
    if(req.method==="POST"&&path==="/"){captured=(await req.json()).files;return new Response(hubHash(captured));}
    if(req.method!=="GET")return new Response("refused",{status:405});
    return fetch("https://hub.bend-lang.com"+path);
  }});
  try {
    const source=resolve(process.env.BEND_SOURCE??join(ROOT,".refs/bend"));
    const entry=`packages/${id}/${id==="js-eval"?"js":id==="math-dsl"?"math":"sqlite"}.bend`;
    const env={BEND_LIB:cache,BEND_HUB:server.url.toString().replace(/\/$/,"")};
    const expected=JSON.parse(await run(["bun","scripts/release/package.ts",entry,source],{env}));
    await run([process.env.BEND_CLI??"bend",entry,"--publish"],{env});
    expect(captured).toEqual(expected);
    expect(Object.keys(expected).sort()).toEqual(id==="sqlite"?["LICENSE","effs/sqlite.c","effs/sqlite.js","sqlite.bend"]:id==="math-dsl"?["LICENSE","math.bend"]:["LICENSE","eval.js","js.bend"]);
  } finally {server.stop(true);await rm(cache,{recursive:true,force:true});}
},120000);

test("SQLite companion builds identically in independent temporary directories",async()=>{
  const source=resolve(process.env.BEND_SOURCE??join(ROOT,".refs/bend"));
  const first=await prepare("sqlite",source),second=await prepare("sqlite",source);
  expect(first.assets).toEqual(second.assets);
},120000);
