// Isolated, loopback-only visual fixture. No auth bypass or fixture route is added to the app.
// Synthetic evidence and mocked requests are NOT proof of real provider/auth/persistence behavior.
import { createRequire } from "node:module";
import { createServer } from "node:http";
const requireTools = createRequire(
  path.join(
    path.resolve(
      process.env.UI_CHECK_TOOLS || "/tmp/eightx-ui-check/node_modules",
    ),
    "package.json",
  ),
);
const { build } = requireTools("esbuild");
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
const repo = path.resolve(import.meta.dirname, "../..");
const output = mkdtempSync(
  path.join(repo, "frontend/node_modules/.visual-preview-"),
);
const code = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from './src/components/workspace';
const source = (text, ids = ['s1']) => ({text, source_segment_ids: ids});
const base = { id: 'product-review', title: 'Product review · the next chapter', meeting_url: null, created_at: '2026-10-02T09:30:00Z', capture_state: 'stopped', transcription_state: 'ready', summary_state: 'ready', failure_code: null, recording_ready: true, duration_seconds: 164, lifecycle_state: 'ready', lifecycle_version: 1, lifecycle_updated_at: null, consent_confirmed_at: null, capture_mode: 'manual' };
const scenario = new URLSearchParams(location.search).get('scenario');
const meetings = [base, {...base, id:'research', title:'Customer research debrief', created_at: '2026-10-01T14:00:00Z', summary_state:'pending', lifecycle_state:'transcribed'}, {...base, id:'demo', title:'Try the notetaker · demo walkthrough', meeting_url:'https://meet.google.com/abc-defg-hij', capture_mode:'demo', capture_state:'not_started', lifecycle_state:'not_started', recording_ready:false, duration_seconds:null, transcription_state:'pending',summary_state:'pending'}];
const evidence = { segments: [
{id:'s1', ordinal:0, start_seconds:12,end_seconds:30,speaker:null,text:'Let’s keep the release focused on the meeting workspace. We agreed to ship the transcript and evidence links first, then look at sharing in the next checkpoint.'},
{id:'s2',ordinal:1,start_seconds:36,end_seconds:63,speaker:null,text:'The biggest opportunity is to make the next action obvious. I will review the onboarding copy. We have not assigned an owner for the mobile review yet.'},
{id:'s3',ordinal:2,start_seconds:78,end_seconds:110,speaker:null,text:'We should test the whole journey with a real recording. Check that the answer links to the exact source and that the transcript survives a reload.'},
{id:'s4',ordinal:3,start_seconds:122,end_seconds:156,speaker:null,text:'There is one open question: should sharing allow a public link or require a signed-in viewer? We need to make that decision before building it.'}],
summary:{overview:source('The team aligned on a focused release of the meeting intelligence workspace. The priority is a complete, evidence-backed journey from the original recording to clear next steps. Sharing will follow once its access model is decided.', ['s1','s3','s4']),topics:[source('A focused release, with evidence at its core. Transcript review and source links take priority over expanding the feature set.'),source('Make the next step obvious. Refine the onboarding copy and verify the experience on smaller screens.', ['s2']),source('Validate the complete journey. Use a real recording to check citations and persistence.', ['s3'])],decisions:[source('Ship transcript review and evidence links before sharing.'),source('Decide the sharing access model before implementation.', ['s4'])]},
actions:[{id:'a1',...source('Review the onboarding copy.', ['s2']),owner:null,due_date:null,completed:false},{id:'a2',...source('Verify the full journey with a real recording.', ['s3']),owner:null,due_date:null,completed:true}],questions:[],jobs:[]};
const empty = {segments:[],summary:null,actions:[],questions:[],jobs:[]};
window.fixtureRequests=[];
window.fetch=async (url, options={})=>{
 window.fixtureRequests.push({url,method:options.method||'GET'});
 await new Promise(r=>setTimeout(r,scenario==='loading'?100000:120));
 if(scenario==='error') return Response.json({detail:{message:'Test fixture: network unavailable. Try again.'}},{status:503});
 const parts=String(url).split('/');
 const m=meetings.find(m=>m.id===parts[4])||base;
 if(parts.at(-1)==='meetings' && options.method!=='POST') return Response.json(scenario==='empty'?[]:meetings);
 if(parts.at(-1)==='evidence') return Response.json(m.capture_mode==='demo'?empty:scenario==='processing'?{...empty,jobs:[{job_key:'transcribe',stage:'transcribe',status:'running',attempts:1,error_code:null,retry_after:null,interrupted:false}]}:evidence);
 if(parts.at(-1)==='questions') { await new Promise(r=>setTimeout(r,1500)); evidence.questions.unshift({id:crypto.randomUUID(),question:JSON.parse(options.body).question,answer:{answer:'The team decided to ship transcript review and evidence links before sharing. The sharing access model remains unresolved.',supported:true,source_segment_ids:['s1','s4']}}); return Response.json({status:'ready'}); }
 if(parts.includes('actions')) {Object.assign(evidence.actions.find(a=>a.id===parts.at(-1)),JSON.parse(options.body));return Response.json({status:'saved'});}
 if(parts.at(-1)==='playback') return Response.json({url:'/fixture.wav'});
 if(parts.at(-1)==='send') {m.capture_mode='demo';m.lifecycle_state='joining';m.lifecycle_version++;}
 if(parts.at(-1)==='advance' && m.lifecycle_state==='joining') {m.lifecycle_state='awaiting_admission';m.lifecycle_version++;}
 if(parts.at(-1)==='admit') {m.lifecycle_state='recording';m.lifecycle_version++;}
 if(parts.at(-1)==='stop') {m.lifecycle_state='ready';m.lifecycle_version++;}
 if(parts.at(-1)==='meetings' && options.method==='POST') return Response.json(meetings[2]);
 return Response.json(scenario==='processing'?{...m,transcription_state:'running',summary_state:'pending',lifecycle_state:'transcribing'}:m);
};
createRoot(document.getElementById('root')).render(<Workspace name='Preview reviewer' />);
`;
await build({
  stdin: {
    contents: code,
    resolveDir: path.join(repo, "frontend"),
    loader: "tsx",
  },
  outfile: path.join(output, "app.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  tsconfig: path.join(repo, "frontend/tsconfig.json"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "isolated-preview-navigation",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link)$/ }, (a) => ({
          path: a.path,
          namespace: "preview",
        }));
        b.onLoad({ filter: /.*/, namespace: "preview" }, (a) => ({
          contents: a.path.endsWith("navigation")
            ? `export const useRouter=()=>({push:(url)=>location.href=url}); export const useSearchParams=()=>new URLSearchParams(location.search);`
            : `import React from 'react'; export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`,
          loader: "js",
          resolveDir: path.join(repo, "frontend"),
        }));
      },
    },
  ],
});
const cssdir = path.join(repo, "frontend/.next/static/chunks");
const css = readdirSync(cssdir)
  .filter((x) => x.endsWith(".css"))
  .map((x) => readFileSync(path.join(cssdir, x), "utf8"))
  .join("\n");
writeFileSync(path.join(output, "app.css"), css);
writeFileSync(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>8x · isolated visual fixture</title><link rel="stylesheet" href="/app.css"></head><body class="font-sans text-sm leading-[1.6]"><div style="padding:5px 15px;background:#352846;color:#e8daf6;font:10px sans-serif;text-align:center">LOCAL UI FIXTURE · Synthetic evidence for layout verification · No live services</div><div id="root"></div><script type="module" src="/app.js"></script></body></html>`,
);
// Silence is only a seekable local media fixture. Never treated as a real meeting recording.
const wav = Buffer.alloc(44 + 8000 * 2 * 170);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const asset = {
    "/": ["index.html", "text/html"],
    "/workspace": ["index.html", "text/html"],
    "/app.js": ["app.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"],
  }[pathname];
  if (pathname === "/fixture.wav") {
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2]
      ? Math.min(Number(range[2]), wav.length - 1)
      : wav.length - 1;
    if (start > end || start >= wav.length) {
      res.writeHead(416);
      res.end();
      return;
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "audio/wav",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` }
        : {}),
    });
    res.end(wav.subarray(start, end + 1));
    return;
  }
  if (!asset || req.method !== "GET") {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" });
  res.end(readFileSync(path.join(output, asset[0])));
});
server.listen(4174, "127.0.0.1", () =>
  console.log(
    "Isolated UI fixture: http://127.0.0.1:4174 (synthetic data; no live services)",
  ),
);
function close() {
  server.close();
  rmSync(output, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
