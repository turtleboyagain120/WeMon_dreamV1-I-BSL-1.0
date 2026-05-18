# React Deploy Template (Vite + React)

Minimal Vite + React template with lint/format scripts and a Vercel deployment config.

## Local dev

```bash
cd react-deploy-template
npm install
npm run dev
```

Open the shown localhost URL.

## Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. In Vercel: **New Project** → select the repo.
3. Vercel will run `npm run build` and deploy `dist/`.

## Project structure

- `src/main.tsx` entry
- `src/App.tsx` sample component
- `src/styles.css` global styles

