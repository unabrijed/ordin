# Ordin landing page

Independent React + TypeScript + Vite + Tailwind app. The root protocol project is unchanged.

## Run

From this folder:

```sh
yarn install --frozen-lockfile
yarn dev
```

Open the local address printed by Vite. To validate TypeScript and produce a static build:

```sh
yarn build
```

Deploy `dist/` to a static host when ready. This page has not been deployed.

## Design

- Cream `#F7F3E8`, navy `#142B40`, electric mint `#D2FA90`, with lilac and peach illustration surfaces.
- Inter Tight headings and DM Sans body copy, loaded from Google Fonts with system fallbacks.
- Modern immersive direction: a deep-navy hero, ambient light, mint gradient typography, frosted navigation, cursor-responsive depth, floating illustrated wallets and storefronts, and staggered reveals. Pointer motion is disabled for touch and reduced-motion preferences; the pause control stops ambient animation too.
- Original CSS/SVG illustrations; no third-party campaign imagery or videos.

The payment playground is an animated SVG illustration, with a dedicated vertical composition on phones. Coins flow from a wallet through a fixed payment policy to a merchant. Cancel stops the flow; reset restarts the illustration. Pause stops page animations, and reduced-motion preferences are respected. This is illustrative animation, not a live billing schedule or contract simulation. No wallet connects and no tokens move. SVG keeps the loop sharp and interactive without a GIF download.

`public/protocol.md` is a snapshot of the root README for the overview link. Refresh it when protocol documentation changes. Copy reflects a local prototype, not a deployed or audited product.

## Files

- `src/main.tsx`: page content, SVG illustrations, and interactive animation controls.
- `src/styles.css`: design system, layout, responsive rules, and animation.
- `public/ordin-mark.svg`: reusable logo mark/favicon.

## Validation

TypeScript and the production build pass using Yarn 1.22.22. The converted Yarn lockfile passes dependency resolution; a clean install could not be verified because the environment has no registry access and its Yarn cache is incomplete. Browser verification could not be completed in the implementation environment: it blocked the preview server's listening port and Chrome launch. Responsive breakpoints and interaction behavior still need a visual pass in a normal browser.
