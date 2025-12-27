# Hipster – Spotify Game Player (GitHub Pages)

## 1) Spotify Developer Dashboard
- Redirect URI (exakt):
  https://lucariomi-1998.github.io/spotify-game-player/callback.html

## 2) Client ID
Die Client ID ist in `config.js` eingetragen:
- window.HIPSTER_CONFIG.spotifyClientId

## 3) Deploy
Diese Dateien in dein GitHub Pages Repo kopieren (Root).

## Hinweise
- Für echte Wiedergabe-Steuerung (Play via API) brauchst du Spotify Premium + ein aktives Gerät.
- iOS Home-Bildschirm App: Login zuerst einmal in Safari testen, dann wieder zum Home-Bildschirm hinzufügen.

## Spotify-Gerät „Hipster“ (Web Playback SDK)

Diese Version lädt zusätzlich das **Spotify Web Playback SDK**, damit die Webapp in Spotify als eigenes Gerät (Name: **Hipster**) auftauchen kann.

Voraussetzungen:
- **Spotify Premium**
- In deinem Spotify Developer Dashboard muss die Redirect URL exakt passen (inkl. `callback.html`)
- Am zuverlässigsten am **Desktop** (Mobile/PWA kann eingeschränkt sein)

### Redirect URL übernehmen

Wenn du in Spotify bereits eine feste Redirect URL eingetragen hast, kannst du sie in `config.js` setzen:

```js
redirectUri: "https://DEIN-NAME.github.io/DEIN-REPO/callback.html"
```

Wenn `redirectUri` leer ist, wird automatisch `${location.origin}${basePath}callback.html` verwendet.

