import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import sharp from "sharp";
import { ApiError } from "./errors.ts";

export const maxLogoBytes = 256 * 1024;
const maxPageBytes = 512 * 1024;

const nonPublic = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) nonPublic.addSubnet(address, prefix);

export function publicAddress(address: string) {
  // Only IPv4 is used by the transport. IPv6 and transition addresses never reach the socket.
  return isIP(address) === 4 && !nonPublic.check(address);
}

function checkedUrl(input: string, base?: URL) {
  const url = URL.parse(input, base);
  const host = url?.hostname.replace(/\.$/, "");
  if (!url || !host || url.protocol !== "https:" || url.port || url.username || url.password ||
      isIP(host) || !host.includes(".") || !/^[a-z0-9.-]+$/.test(host) ||
      /\.(?:localhost|local|internal|test|invalid|example|onion|lan|home|arpa)$/.test(host)) {
    throw new ApiError(400, "logo_invalid_url");
  }
  url.hash = "";
  return url;
}

export function imageLinks(html: string) {
  const lower = html.replace(/[A-Z]/g, (char) => char.toLowerCase());
  const candidates: { href: string; priority: number; size: number }[] = [];
  let cursor = 0;
  while ((cursor = html.indexOf("<", cursor)) !== -1) {
    if (html.startsWith("<!--", cursor)) {
      const end = html.indexOf("-->", cursor + 4);
      if (end === -1) break;
      cursor = end + 3;
      continue;
    }
    const start = ++cursor;
    while (/[a-z0-9-]/.test(lower[cursor] ?? "")) cursor++;
    const name = lower.slice(start, cursor);
    const boundary = html[cursor];
    if (!boundary || !/[\s/>]/.test(boundary)) continue;
    const end = tagEnd(html, cursor);
    if (end === html.length) break;
    const attributes = cursor;
    cursor = end + 1;
    if (name === "script" || name === "style" || name === "template") {
      const close = lower.indexOf(`</${name}`, cursor);
      if (close === -1) break;
      cursor = close + name.length + 2;
      continue;
    }
    if (!["link", "meta", "img"].includes(name) || end - attributes > 4096) continue;
    const attrs = tagAttributes(html.slice(attributes, end));
    const rel = attrs.get("rel")?.toLowerCase().split(/\s+/) ?? [];
    const declaredLogo = attrs.get("itemprop")?.toLowerCase().split(/\s+/).includes("logo") ?? false;
    const touch = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    const icon = name === "link" && (touch || rel.includes("icon"));
    if (!declaredLogo && !icon) continue;
    const href = attrs.get(name === "meta" ? "content" : name === "img" ? "src" : "href");
    if (!href || href.length > 2048 || /\.(ico|svg)(?:[?#]|$)/i.test(href) || attrs.get("type") === "image/svg+xml") continue;
    candidates.push({
      href: href.replace(/&amp;/gi, "&"),
      priority: declaredLogo ? 2 : touch ? 1 : 0,
      size: Number.parseInt(attrs.get("sizes") ?? "", 10) || 0,
    });
  }
  return [...new Set(candidates.sort((a, b) => b.priority - a.priority || b.size - a.size).map(({ href }) => href))].slice(0, 3);
}

function tagEnd(html: string, start: number) {
  let quote = "";
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return html.length;
}

function tagAttributes(source: string) {
  const attrs = new Map<string, string>();
  let index = 0;
  while (index < source.length) {
    while (/[\s/=]/.test(source[index] ?? "")) index++;
    const start = index;
    while (index < source.length && !/[\s/=]/.test(source[index])) index++;
    if (index === start) break;
    const key = source.slice(start, index).toLowerCase();
    while (/\s/.test(source[index] ?? "")) index++;
    if (source[index] !== "=") continue;
    index++;
    while (/\s/.test(source[index] ?? "")) index++;
    const quote = source[index] === '"' || source[index] === "'" ? source[index++] : null;
    const valueStart = index;
    while (index < source.length && (quote ? source[index] !== quote : !/\s/.test(source[index]))) index++;
    const value = source.slice(valueStart, index);
    if (quote) index++;
    if (!attrs.has(key)) attrs.set(key, value);
  }
  return attrs;
}

export async function normalizeLogo(input: Uint8Array) {
  if (input.byteLength > maxLogoBytes) throw new ApiError(413, "logo_too_large");
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const bytes = Buffer.from(input);
  if (!bytes.subarray(0, 8).equals(png) && !bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
      !(bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")) {
    throw new ApiError(422, "logo_invalid_image");
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 4_194_304, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format) || metadata.width < 16 || metadata.height < 16 ||
        (metadata.pages ?? 1) > 1 ||
        (metadata.format === "png" && animatedPng(bytes))) throw Error();
    return await image.autoOrient().resize(128, 128, { fit: "inside", withoutEnlargement: true }).webp().toBuffer();
  } catch {
    throw new ApiError(422, "logo_invalid_image");
  }
}

function animatedPng(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset += 12 + bytes.readUInt32BE(offset);
  }
  return false;
}

type RemoteResponse = { location: string } | { bytes: Buffer; html: boolean };

async function remoteResponse(url: URL, signal: AbortSignal): Promise<RemoteResponse> {
  signal.throwIfAborted();
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  let addresses: string[];
  try {
    addresses = await resolver.resolve4(url.hostname);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  if (!addresses.length || addresses.some((address) => !publicAddress(address))) throw new ApiError(422, "logo_not_found");
  const [address] = addresses;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false, family: 4, signal,
      headers: { "Accept-Encoding": "identity", Accept: "image/webp,image/png,image/jpeg,text/html" },
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
    }, (response) => {
      response.on("error", reject);
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        resolve({ location: response.headers.location });
        return;
      }
      if (status !== 200 || !["identity", undefined].includes(response.headers["content-encoding"])) {
        response.destroy();
        reject(new ApiError(422, "logo_not_found"));
        return;
      }
      const html = response.headers["content-type"]?.split(";")[0].trim().toLowerCase() === "text/html";
      const limit = html ? maxPageBytes : maxLogoBytes;
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > limit) {
          reject(new ApiError(413, "logo_too_large"));
          response.destroy();
        } else {
          chunks.push(chunk);
        }
      });
      response.on("end", () => resolve({ bytes: Buffer.concat(chunks), html }));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function getRemoteLogo(input: string, load = remoteResponse, signal = AbortSignal.timeout(5_000)) {
  let redirects = 0;
  async function download(url: URL) {
    for (;;) {
      signal.throwIfAborted();
      const result = await load(url, signal);
      if ("bytes" in result) return { ...result, url };
      if (++redirects > 3) throw new ApiError(422, "logo_not_found");
      url = checkedUrl(result.location, url);
    }
  }

  try {
    const first = await download(checkedUrl(input));
    if (!first.html) return await normalizeLogo(first.bytes);
    for (const link of imageLinks(first.bytes.toString("utf8"))) {
      try {
        const image = await download(checkedUrl(link, first.url));
        if (!image.html) return await normalizeLogo(image.bytes);
      } catch {
        if (signal.aborted) break;
      }
    }
    throw new ApiError(422, "logo_not_found");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "logo_not_found");
  }
}
