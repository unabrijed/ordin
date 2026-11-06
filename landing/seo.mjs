/** Deployment-only metadata. No guessed domains or preview URLs as canonicals. */
export function siteMetadata(env = {}) {
  const deployment = env.VERCEL_TARGET_ENV || env.VERCEL_ENV;
  const preview = Boolean(deployment && deployment !== "production");
  const configured =
    env.SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  let origin = "";
  if (configured) {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      url.port ||
      url.hostname === "localhost"
    ) {
      throw new Error(
        "SITE_URL must be an HTTPS origin without a path, credentials, port, query, or fragment.",
      );
    }
    origin = url.origin;
  }
  if (deployment === "production" && !origin) {
    throw new Error(
      "Production metadata needs VERCEL_PROJECT_PRODUCTION_URL or an explicit SITE_URL. Enable Vercel system environment variables.",
    );
  }
  const indexable = Boolean(origin) && !preview;
  const escape = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const canonical = origin ? `${origin}/` : "";
  const tags = canonical
    ? `<link rel="canonical" href="${escape(canonical)}">\n  <meta property="og:url" content="${escape(canonical)}">`
    : "";
  const sitemap = indexable
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(canonical)}</loc></url></urlset>\n`
    : "";
  return {
    origin,
    canonical,
    indexable,
    tags,
    sitemap,
    robotsMeta: indexable
      ? "index, follow, max-image-preview:large"
      : "noindex, follow",
  };
}

export function applyMetadata(html, metadata) {
  return html
    .replace(
      '<meta name="robots" content="noindex, follow">',
      `<meta name="robots" content="${metadata.robotsMeta}">`,
    )
    .replace("<!-- deployment-metadata -->", metadata.tags);
}
