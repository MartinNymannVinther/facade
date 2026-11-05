# The tool card for haij.dk

The copy for Facade's card on the family's front page, in both languages,
and the entry for the site's `src/content/tools.ts`. It belongs in the
haij-site repository, not this one; it is kept here so the words are
written by the people who built the tool.

haij.dk already lists the portfolio tool as coming ("Portefølje",
`portefolje.haij.dk`). Facade is that tool made generic: the entry below
replaces it, and it goes live only after dogma seven — one real quarter
run in it (docs/launch.md).

## Dansk

**Facade — Porteføljen i én rytme.**

Simpel porteføljestyring til små og mellemstore organisationer. Skriv
udviklingsinitiativerne ned — projekter, opgaver og eksperimenter — og
beskriv dem, så de kan vejes mod hinanden. Prioritér dem i én rækkefølge,
med WSJF eller i hånden. Læg kvartalets plan, brudt ned i leverancer og
sat op mod teamenes ledige kapacitet, og vis vejen frem på en roadmap,
der som standard ser ni måneder frem. Status og en beslutningslog holder
porteføljen ærlig. AI'en kan skærpe en beskrivelse eller foreslå
leverancer; et menneske bestemmer.

## English

**Facade — The portfolio in one rhythm.**

Simple portfolio management for small and mid-sized organizations. Write
the development initiatives down — projects, tasks and experiments — and
describe them so they can be weighed against each other. Prioritize them
in one order, with WSJF or by hand. Plan the quarter, broken into
deliverables and set against the teams' free capacity, and show the way
ahead on a roadmap that looks nine months out by default. Status and a
decision log keep the portfolio honest. The AI can sharpen a description
or propose deliverables; a person decides.

## The entry

```ts
{
  id: "facade",
  host: "facade.haij.dk",
  status: "coming",
  text: {
    da: {
      name: "Facade",
      tagline: "Porteføljen i én rytme.",
      description:
        "Initiativer, prioritering, kvartalsplan med kapacitet, roadmap, status og beslutningslog — simpel porteføljestyring til små og mellemstore organisationer.",
      note: "På vej",
    },
    en: {
      name: "Facade",
      tagline: "The portfolio in one rhythm.",
      description:
        "Initiatives, prioritization, a quarter plan with capacity, a roadmap, status and a decision log — simple portfolio management for small and mid-sized organizations.",
      note: "Coming",
    },
  },
}
```
