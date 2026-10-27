# p5.soundline

Van geluidsbestand naar tijdgecodeerde p5.js-functies in `draw()`. Twee pagina's: `voorbeeld.html` (één keuze, hoogstens tien visuele momenten) en `index.html` (het lab). Geen buildstap; vanilla JS, Nederlands.

- Pure modules: `soundline-analysis.js`, `soundline-codegen.js`, `soundline-taps.js` (DOM-vrij, UMD). Tests: `node analysis.test.js`, `node codegen.test.js`, `node taps.test.js`. Elke wijziging aan een detector of de generator krijgt een test.
- Werkwijze en verificatie staan in `METHODE.md`; gebruik en contract in `README.md`.
- `brunk.mp3` is een lokale voorbeeldtrack en staat in `.gitignore`.

## UI/UX skills

Taste, a11y, bans, voice, and icon library for this project live in `.ux-profile.md`.
Run `setup-ui-ux-skills` again only to change those defaults.
Before UI or microcopy work, read `.ux-profile.md`, then the matching domain skill (page-patterns, viewports, forms, surfaces, loaders, empty-states, copy, motion).
Before creating a new page, read `page-patterns` and name the pattern. Do not write page markup until the pattern is named.
Layouts must pass `viewports` at 375px and 1280px.
Before finishing UI, run `ux-audit`.
