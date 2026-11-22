import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const files = join(root, 'files');
await mkdir(files,{recursive:true});
const allowed = new Set(['openreader-positions.json','xujialiu-positions.json','zotero-openreader-positions.json','zotero-tts-positions.json']);
const server = createServer(async (req,res) => {
  const method = req.method;
  const pathname = new URL(req.url,'http://localhost').pathname;
  const name = pathname.slice('/dav/'.length);
  const respond = async (code, body = '') => {
    await appendFile(join(root,'requests.log'),JSON.stringify({method,pathname,code})+'\n');
    res.writeHead(code).end(body);
  };
  if ((pathname === '/dav/' || pathname === '/dav') && method === 'PROPFIND') {
    return respond(207,'<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response></D:multistatus>');
  }
  if (method === 'MKCOL' && (pathname === '/dav' || pathname === '/dav/')) return respond(405);
  if (!pathname.startsWith('/dav/') || !allowed.has(name)) return respond(404);
  try {
    if (method === 'GET') return await respond(200,await readFile(join(files,name)));
    if (method === 'PUT') {
      const data=[]; for await (const chunk of req) data.push(chunk);
      await writeFile(join(files,name),Buffer.concat(data));
      return await respond(201);
    }
  } catch (err) { if (err.code === 'ENOENT') return respond(404); return respond(500); }
  return respond(405);
});
server.listen(0,'127.0.0.1',async()=>{const port=server.address().port;await writeFile(join(root,'port'),String(port)); console.log('Loopback WebDAV port',port);});
