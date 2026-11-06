import test from "node:test";
import assert from "node:assert/strict";
import { siteMetadata, applyMetadata } from "./seo.mjs";

test("Vercel production uses its stable production domain, never the deployment URL", () => {
  const meta = siteMetadata({
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "ordin-test.vercel.app",
    VERCEL_URL: "ordin-hash.vercel.app",
  });
  assert.equal(meta.canonical, "https://ordin-test.vercel.app/");
  assert.equal(meta.indexable, true);
  assert.match(meta.sitemap, /<loc>https:\/\/ordin-test.vercel.app\/<\/loc>/);
  assert.doesNotMatch(meta.tags, /ordin-hash/);
});
test("preview and custom environments stay noindex and do not publish a sitemap", () => {
  for (const env of [
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "production", VERCEL_TARGET_ENV: "staging" },
  ]) {
    const meta = siteMetadata({
      ...env,
      VERCEL_PROJECT_PRODUCTION_URL: "ordin-test.vercel.app",
    });
    assert.equal(meta.robotsMeta, "noindex, follow");
    assert.equal(meta.sitemap, "");
    assert.equal(meta.canonical, "https://ordin-test.vercel.app/");
  }
});
test("local build has no invented origin", () => {
  const meta = siteMetadata({});
  assert.equal(meta.tags, "");
  assert.equal(meta.sitemap, "");
  assert.equal(meta.indexable, false);
});
test("explicit HTTPS site origin can override the Vercel domain", () => {
  assert.equal(
    siteMetadata({
      SITE_URL: "https://ordin.test",
      VERCEL_PROJECT_PRODUCTION_URL: "ordin-test.vercel.app",
    }).canonical,
    "https://ordin.test/",
  );
});
test("invalid public URLs and missing production metadata fail early", () => {
  for (const SITE_URL of [
    "http://ordin.test",
    "https://ordin.test/path",
    "https://user:pass@ordin.test",
    "https://ordin.test/?x=1",
    "https://ordin.test/#x",
  ])
    assert.throws(() => siteMetadata({ SITE_URL }));
  assert.throws(() => siteMetadata({ VERCEL_ENV: "production" }));
});
test("HTML receives indexability and canonical metadata without changing other markup", () => {
  const source =
    '<meta name="robots" content="noindex, follow"><!-- deployment-metadata --><h1>Ordin</h1>';
  const out = applyMetadata(
    source,
    siteMetadata({ SITE_URL: "https://ordin.test" }),
  );
  assert.match(out, /content="index, follow, max-image-preview:large"/);
  assert.match(out, /rel="canonical" href="https:\/\/ordin.test\/"/);
  assert.match(out, /<h1>Ordin<\/h1>/);
});
