# Museumdex

A Pokémon-style museum explorer built with [Phaser 3](https://phaser.io/), played
in Dutch. Walk the four wings of Design Museum Gent, inspect the pieces to
register them in your Museumdex, and don't let MARLOT photograph you.

**The exhibits are real.** Every plinth holds an actual object from the museum's
collection, pulled live from its open API at launch, photograph and curatorial
text included. Reload the page and you get a different museum.

**[▶ Play it](https://mathijsrochus.github.io/pokemon-museum-demo/)**

![The museum floor, with four exhibits on plinths](screenshot.png)

## Controls

| Key | Action |
|-----|--------|
| Pijltjes / WASD | Walk |
| SPATIE | Inspect the piece in front of you, then advance the text |
| P | Open the Museumdex |
| ESC | Close it again |

Stand directly below a plinth to inspect it — a gold chevron appears over
anything you can interact with. Step into a doorway to change wing.

## Running it locally

There is no build step and nothing to install, but it does need to be served —
the collection photographs are read pixel-by-pixel into canvas textures, which
browsers refuse to do on `file://`.

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Phaser comes from a CDN and the museum data
comes over the network, so the first load needs an internet connection. Without
one the game still starts, on four hand-drawn demo pieces.

## The collection API

Data comes from [Design Museum Gent's open API](https://data.designmuseumgent.be/v2)
— no key, CORS open, JSON-LD in the CIDOC-CRM vocabulary, which is why the field
names look like `crm:P108i_was_produced_by` rather than `maker`. Roughly 9,900
published objects.

Everything API-facing lives in the `DMG` object in `game.js`. Three things about
the API shaped it:

**The collection listing is thin.** `/id/objects` returns a label and a IIIF
manifest id and nothing else — no photograph, no description. So each exhibit
costs one extra detail request, and the detail response is where the good
material is: description, image, maker, materials, techniques, real dimensions,
acquisition history.

**Consecutive catalogue numbers are the same object.** `1998-0024_044-755` is
the 44th of 755 fragments of one album. Taking a page of the collection gets you
four views of the same thing, so each exhibit is drawn from its own random page
and then deduplicated by catalogue prefix.

**Both hosts fail intermittently.** The data API and the image host have both
been seen to answer `500` in bursts and recover a second later, so every request
retries twice before it counts, and a photo that never arrives costs its exhibit
a photograph rather than taking the game down.

**Photographs and data fail separately.** The data API serves the catalogue text
from one service and the image URLs from another. During development the second
one dropped out entirely — the same object that had returned `image` and
`crm:P138i_has_representation` an hour earlier returned neither, while the IIIF
host itself kept answering `200`. So a photograph is treated as a bonus, never a
requirement: an exhibit needs only a name and a description, and when no
photograph arrives it is drawn as its category instead. Requiring a photo would
mean an image outage threw away sixteen real objects and left the player with
demo pieces, with the catalogue text sitting right there.

Descriptions are **Dutch only** — 36 of 36 sampled objects had exactly one
description, all tagged `NLD`, and titles are Dutch too. That is why the whole
game is in Dutch: there is no second language to switch to. (Concept records —
object types and materials — *do* carry English `skos:prefLabel`s, if a
bilingual mode is ever wanted.)

## How it works

**Almost every pixel is generated at runtime.** The marble, the walls, the
plinths, the doorways, the player's 16-frame walk cycle and MARLOT herself are
drawn into canvas-backed Phaser textures when the scene starts. The `px()`
helper inside `makeTexture()` is the whole drawing API. The one exception is the
exhibits themselves, which are photographs.

**Photographs become pixel art in three steps** (`drawPhotoExhibit`). A 64px
IIIF render is averaged down to about 20px wide — *with* smoothing on, which is
the opposite of what pixel art usually wants, but at worse than 3:1 sampling
single pixels throws away five of every six and comes out as confetti. Then the
photographer's backdrop is flooded away from the edges at a deliberately tight
tolerance, because museum objects are often as pale as the sweep they are shot
on and a generous threshold eats the object instead. Then a bounded two-pass
feather removes the halo that averaging left behind, and the result is
posterised to six levels per channel.

**Objects with no photograph are drawn as their category.** `DMG.CATEGORIES`
sorts an object into one of five buckets — vessel, furniture, tile, textile,
device — and each has a hand-drawn piece. The buckets were chosen by running the
museum's own type index (687 type names, ~12,950 objects) through the classifier
and measuring: these five cover **88%** of the collection. The rest fall back to
a crate, and mostly deserve to — the largest unmatched types are `onderdeel`,
`fragment` and `staal (monster)`, where a crate is the honest answer rather than
a wrong guess.

Matching is on word *endings*, not substrings, because Dutch compounds carry the
category in the final element: a `champagneglas` is a glass, a `bijzettafel` is a
table, a `stapelstoel` is a chair. Suffix matching also dodges the trap plain
substring matching falls into, where `kandelaar` reads as a jug because `kan`
sits inside it. Diminutives are stemmed too, which is worth real coverage —
`schoteltje` alone is 381 objects.

**Everything loads once, up front.** All 16 objects and all 16 photographs are
fetched behind the loading screen before Phaser starts, so walking between wings
never waits on the network. A room change only throws away tile sprites and adds
new ones from textures that already exist.

**Rooms are authored as text**, in `ROOMS` — `#` wall, `.` floor, `E` plinth,
`1`-`9` a doorway keyed to that room's `exits`. Exhibit tile values are handed
out across the whole museum in reading order, so the floor plan decides how many
objects to fetch rather than a number repeated somewhere.

**MARLOT is a four-state cycle**, not a wandering NPC:

```
HIDDEN ──▶ TELEGRAPH ──▶ SOLID ──▶ FADING ──▶ HIDDEN
(gone)     (lining up      (SHUTTER  (lowering
            the shot)       FIRES)    the camera)
```

Only `SOLID` catches you. `TELEGRAPH` puts an autofocus frame on the tile she is
about to shoot from, so every photo is one the player could see coming. She also
freezes completely while any overlay is open — otherwise you could be
photographed mid-sentence while reading a label — and she never follows you
through a doorway.

**Difficulty lives in one function.** `difficultyFor(threat)` maps a single
`0..1` scalar onto every parameter — how long the warning lasts, how long the
shutter stays open, how close she may appear, how many of her there are, and
whether she repositions. `threat` climbs as `time² + 0.15 per discovery`, and the
AANDACHT slider in the HUD overrides it so you can demo any difficulty instantly.

**Fairness rules** are enforced in `pickSpawnTile()`: never on your tile or the
one you are already moving into, never in a wall or a doorway, and never without
leaving you at least one free adjacent tile to escape to. If no fair tile exists
she waits rather than forcing a spawn.

## Changing the museum

**A different floor plan:** edit `ROOMS`. Add or move an `E` and the fetch count,
the textures, the dialogue, the badges, the dex grouping and the progress counter
all follow — the only rules are that every plinth needs a walkable tile directly
below it and every doorway needs a matching entry in that room's `exits`.

**More or fewer objects per wing:** same thing. `EXHIBIT_SLOTS` is counted off
the compiled rooms, so nothing else needs touching.

**A different category stand-in:** add a bucket to `DMG.CATEGORIES` and a
matching drawing to `PROCEDURAL_ART`. The classifier reports which types fall
through — run the type index past `fallbackArtFor()` to see what a new bucket
would be worth before drawing anything.

**Retrying keeps the same museum** and returns you to the Inkomhal; reload the
page for a new set of objects.
