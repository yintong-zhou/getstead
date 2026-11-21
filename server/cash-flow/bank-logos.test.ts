import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { imageLinks, normalizeLogo, publicAddress, getRemoteLogo } from "./bank-logos.ts";

test("only public IPv4 addresses are eligible for outbound connections", () => {
  for (const address of ["127.0.0.1", "10.2.0.4", "100.64.0.1", "169.254.169.254", "192.168.0.1", "192.0.0.1", "198.18.0.1", "203.0.113.3", "224.0.0.1", "::ffff:8.8.8.8"]) {
    assert.equal(publicAddress(address), false, address);
  }
  assert.equal(publicAddress("8.8.8.8"), true);
});

test("a page yields bounded icon candidates, without treating scripts as icons", () => {
  assert.deepEqual(imageLinks('<script>let x = "<link rel=icon href=/wrong.png>";</script><link href="/brand.png?x=1&amp;y=2" rel="apple-touch-icon"><link rel=icon href=/brand.ico>'), ["/brand.png?x=1&y=2"]);
});

test("pages can declare a logo without using a favicon tag", () => {
  assert.deepEqual(imageLinks([
    '<img src="/marketing.png" alt="Product photo">',
    '<link rel="icon" href="/favicon.png">',
    '<meta itemprop="logo" content="/brand.png">',
    '<img itemprop="logo" src="/brand-retina.webp">',
  ].join("")), ["/brand.png", "/brand-retina.webp", "/favicon.png"]);
});

test("the icon scan handles long markup and bounds the attributes it reads", () => {
  const padding = "a".repeat(250_000);
  assert.deepEqual(imageLinks(`<link ${padding}><script>${padding}</script><LINK REL=icon HREF=/brand.png>`), ["/brand.png"]);
});

test("images are decoded, resized and rewritten as WebP", async () => {
  const input = await sharp({ create: { width: 300, height: 150, channels: 3, background: "green" } }).png().toBuffer();
  const image = await sharp(await normalizeLogo(input)).metadata();
  assert.equal(image.format, "webp");
  assert.equal(image.width, 128);
  assert.equal(image.height, 64);
  for (const invalid of [Buffer.from("<svg/>"), Buffer.alloc(262145), input.subarray(0, 25)]) {
    await assert.rejects(normalizeLogo(invalid));
  }
});

test("remote lookup rejects unsafe URLs before making a request", async () => {
  for (const url of ["http://example.com/icon", "https://127.0.0.1/", "https://localhost/", "https://example.com:444/", "https://a:b@example.com/"]) {
    await assert.rejects(getRemoteLogo(url), { code: "logo_invalid_url" });
  }
});

test("remote lookup resolves relative icons and validates every redirect", async () => {
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
  const visited: string[] = [];
  const logo = await getRemoteLogo("https://example.com/bank/", async (url) => {
    visited.push(url.pathname);
    if (url.pathname === "/bank/") return { bytes: Buffer.from("<link rel=icon href=logo.png>"), html: true };
    return { bytes: png, html: false };
  });
  assert.equal((await sharp(logo).metadata()).format, "webp");
  assert.deepEqual(visited, ["/bank/", "/bank/logo.png"]);
  await assert.rejects(getRemoteLogo("https://example.com/", async () => ({ location: "http://example.com/logo.png" })), { code: "logo_invalid_url" });
  await assert.rejects(getRemoteLogo("https://example.com/", async () => ({ location: "/loop" })), { code: "logo_not_found" });
  await assert.rejects(getRemoteLogo("https://example.com/", async () => assert.fail("A cancelled lookup must not reach the network"), AbortSignal.abort()), { code: "logo_not_found" });
});
