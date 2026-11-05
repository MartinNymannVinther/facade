# The tool card for haij.dk

The copy for Facade's card on haij.dk, in both languages, with the entry
proposed for the site's `tools.ts`. It belongs in the haij.dk repository;
it is written here so it travels with the release it describes. Dogma seven
decides when it goes up: not before real work has run on it.

## Dansk

**Facade** — Arbejdet bag facaden.

Et fælles sted til et lille hold: projekter med sider I skriver på samtidig,
og samtalen lige ved siden af. Kanaler, tråde, en indbakke til det, der er
rettet mod dig, og søgning i det hele. Alt kan hentes ud som Markdown, og AI'en
foreslår, men et menneske sætter ind. Kører hos Mistral i EU eller på din egen
maskine med Ollama.

## English

**Facade** — The work behind the facade.

One shared place for a small team: projects with pages you write on at the
same time, and the conversation right beside them. Channels, threads, an inbox
for what is aimed at you, and search across it all. Everything comes out as
Markdown, and the AI proposes while a person puts it in. Runs at Mistral in the
EU or on your own machine with Ollama.

## The entry

```ts
{
  slug: "facade",
  name: "Facade",
  tagline: { da: "Arbejdet bag facaden.", en: "The work behind the facade." },
  url: "https://facade.haij.dk",
  repo: "https://github.com/MartinNymannVinther/facade",
  license: "AGPL-3.0",
  status: "beta",
  selfHost: true,
  ai: { providers: ["mistral-eu", "ollama"], decides: "human" },
}
```
