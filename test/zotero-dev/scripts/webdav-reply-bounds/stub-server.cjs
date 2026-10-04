#!/usr/bin/env node
"use strict";
/*
 * The local WebDAV stub for the webdav-reply-bounds case (issue #169).
 * Started with node from this kit on 127.0.0.1 and an ephemeral port, and
 * stopped at the end of the case. It holds no data and answers whatever the
 * file or method (GET and PROPFIND alike) under four folders:
 *
 *   /stall/    — 200 (207 for PROPFIND), headers and a first fragment of
 *                the body, chunked, then nothing; the socket stays open.
 *   /big/      — 200, chunked with no Content-Length, spaces streamed
 *                without pause up to 64 MiB, then the end.
 *   /declared/ — 200 with Content-Length: 10485761, then nothing; the
 *                socket stays open.
 *   /broken/   — 200, chunked, a first fragment, then the socket is
 *                destroyed mid-chunk.
 *
 * Per request it logs one JSON line to stdout: the method, the path, the
 * bytes written, and when the client closed the connection, relative to
 * the request's arrival. Headers are never logged (the client's
 * Authorization header is none of the log's business).
 */

const http = require("node:http");

const BIG_TOTAL = 64 * 1024 * 1024; // 64 MiB
const CHUNK = 256 * 1024; // 256 KiB per write
const SPACE_CHUNK = " ".repeat(CHUNK);

const server = http.createServer((req, res) => {
  const arrivedAt = Date.now();
  const path = (req.url || "/").split("?")[0];
  const folder = path.split("/")[1] || "";
  const id = `${arrivedAt % 100000}-${req.method}`;
  let bodyBytes = 0;
  let ended = false;

  const closeLine = (how) => {
    if (ended) return;
    ended = true;
    const line = {
      ev: "close",
      id,
      method: req.method,
      path: folder + "/",
      how, // 'client' = the client closed/reset; 'end' = we finished the response
      bodyBytes,
      socketBytes: req.socket ? req.socket.bytesWritten : null,
      msAfterRequest: Date.now() - arrivedAt,
    };
    process.stdout.write(JSON.stringify(line) + "\n");
  };

  req.on("close", () => closeLine(ended ? "end" : "client"));
  res.on("close", () => closeLine(ended ? "end" : "client"));
  // The client closing its sending side (a FIN) without a full teardown —
  // as when Zotero cancels a reply's body — fires 'end' on the socket, not
  // 'close'; log it too, as 'client-fin'. (2026-10-04: the run showed the
  // full-close detection alone missing Zotero's half-closes.)
  req.socket?.on("end", () => closeLine("client-fin"));
  req.socket?.on("error", () => closeLine("client-reset"));

  const write = (buf) => {
    bodyBytes += buf.length;
    res.write(buf);
  };

  if (folder === "stall") {
    const status = req.method === "PROPFIND" ? 207 : 200;
    res.writeHead(status, { "Content-Type": req.method === "PROPFIND" ? "application/xml; charset=utf-8" : "application/json" });
    write(req.method === "PROPFIND" ? "<?xml version=\"1.0\"?><multistatus><response><href>/stall/</href>" : "{\"partial\":");
    // ...and then nothing. The socket stays open.
    return;
  }

  if (folder === "big") {
    res.writeHead(200, { "Content-Type": "application/json" }); // no Content-Length: chunked
    let written = 0;
    const pump = () => {
      while (written < BIG_TOTAL) {
        const n = Math.min(CHUNK, BIG_TOTAL - written);
        written += n;
        bodyBytes += n;
        if (!res.write(n === CHUNK ? SPACE_CHUNK : " ".repeat(n))) {
          res.once("drain", pump);
          return;
        }
      }
      res.end();
    };
    pump();
    return;
  }

  if (folder === "declared") {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": String(10 * 1024 * 1024 + 1) });
    res.flushHeaders(); // the headers must reach the client (2026-10-04: without a body write they never left the stub, and fetch timed out on the headers instead)
    // ...and then nothing. The socket stays open.
    return;
  }

  if (folder === "broken") {
    res.writeHead(200, { "Content-Type": "application/json" }); // chunked
    write("{\"fragment\":");
    // The socket is destroyed mid-chunk: no terminating chunk, no FIN.
    setImmediate(() => req.socket.destroy());
    return;
  }

  res.writeHead(404, { "Content-Length": "0" });
  res.end();
  process.stdout.write(JSON.stringify({ ev: "close", id, method: req.method, path: folder + "/", how: "404", bodyBytes: 0, socketBytes: 0, msAfterRequest: Date.now() - arrivedAt }) + "\n");
});

server.on("clientError", (err, socket) => {
  process.stdout.write(JSON.stringify({ ev: "clientError", message: String(err && err.message || err) }) + "\n");
});

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  process.stdout.write(JSON.stringify({ ev: "listening", host: addr.address, port: addr.port, pid: process.pid }) + "\n");
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
