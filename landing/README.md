# Ordin landing page

The current page is the repository-root `index.html`. It contains the markup, styles, inline SVG brand mark, and small menu/motion script. The Vite commands in this folder serve and build that same file; the earlier React files are retained design iterations and are not the active entry point.

## Local preview

From the repository root:

```sh
yarn --cwd landing install --frozen-lockfile
yarn --cwd landing dev
```

Open Vite's printed URL. Restart an older running server after changing the Vite root. The HTML also opens directly from disk; fonts and the provided background video require network access. Without the video, the navy background and all content remain visible.

## Build and test

```sh
yarn --cwd landing build
yarn --cwd landing test:seo
```

The build runs six deployment-metadata tests and the existing TypeScript check, then writes the website to `landing/dist/`. The production site does not need React to render.

## Design and content

Single-screen desktop composition using navy, cream, and teal. The oval sprig mark is preserved. Inter is used for the interface; Instrument Serif italic accents the headline. Three bottom items explain owner authorization, a merchant collection request, and contract validation followed by a direct transfer. The page makes no live wallet calls or automatic-collection claims.

The supplied background MP4 has no color overlay. It can be paused and is hidden for reduced-motion preferences. Mobile menus support Escape and close on navigation or desktop resizing. Short/mobile screens may scroll to keep all content reachable.

## Vercel deployment

Import the repository with **Root Directory set to the repository root**, not `landing/`. `vercel.json` sets:

- Install: `yarn --cwd landing install --frozen-lockfile`
- Build: `yarn --cwd landing build`
- Output: `landing/dist`

Keep Vercel system environment variables enabled. The build reads `VERCEL_PROJECT_PRODUCTION_URL` for canonical and Open Graph URLs. `SITE_URL` can override it later with an HTTPS origin, for example a future custom domain. No example domain is emitted into the real build.

Production emits indexable metadata, `/sitemap.xml`, and the sitemap entry in `/robots.txt`. Preview/custom deployment environments receive `noindex, follow` in HTML and no sitemap. Local builds have no invented canonical URL and stay `noindex`. `robots.txt` allows crawling; it is not a security control.

## Search and agent-readable content

- `index.html`: title, description, Open Graph/Twitter text metadata, and WebSite/WebPage/SoftwareApplication JSON-LD.
- `/index.md`: the page's payment-flow explanation in Markdown.
- `/llms.txt`: concise product facts and links for LLM retrieval.
- `/llms-full.txt`: generated from `index.md` and the current root README.
- `/README.md` and `/docs/TESTNET.md`: authoritative project documentation copied at build time.

LLM files are documentation aids, not a hosted agent API or a guarantee of search visibility. Social metadata is text-only; no invented social image is supplied.

## Verification limits

Build and metadata tests run locally. This environment has blocked preview-server sockets and browser launch, so visual inspection and live video playback still need verification in a normal browser. Deployment is configured but has not been performed.
