# SonuxBox web

The site for SonuxBox: upload a map (or pick a sample), hear it, and watch the playhead sweep across the image while the notes light up.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

It talks to the engine at `VITE_API_URL` (see `.env.example`). Unset, it uses the Heroku app.

Deploying on Vercel: set the project's root directory to `frontend`. Vercel picks up Vite on its own.
