# Museumdex

A Pokémon-style museum explorer built with [Phaser 3](https://phaser.io/), played
in Dutch. Walk the four wings of Design Museum Gent, inspect the pieces to
register them in your Museumdex, and don't let MARLOT photograph you.

**The exhibits are real.** Every plinth holds an actual object from the museum's
collection, pulled live from its open API at launch, photograph and curatorial
text included. Reload the page and you get a different museum.

**[▶ Play it](https://mathijsrochus.github.io/pokemon-museum-demo/)**

![The Inkomhal: plinths with drawn objects, two already ticked into the
Museumdex, a gold and a purple gem marking the rarest pieces, and MARLOT lining
up a shot inside her autofocus frame](screenshot.png)

At the end of a run, every piece you registered comes back with the museum's own
photograph and its rarity — a Tupperware `Kookpot` that is the only one of its
type in nine thousand objects, next to a wall tile that is one of 540:

![The end-of-run gallery: three collected objects with real photographs, each
with a coloured rarity chip — Gewoon 540, Unicum 1, Ongewoon 46](screenshot-gallery.png)

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

**`fullRecord=true` is the whole game.** By default `/id/objects` returns a
label and a manifest id and nothing else, which makes every exhibit cost a
second request for its description. With the flag, one page of one item is one
finished record — description, maker, materials, techniques, real dimensions,
acquisition history — so sixteen exhibits are sixteen requests rather than
forty-eight.

**Consecutive catalogue numbers are the same object.** `1998-0024_044-755` is
the 44th of 755 fragments of one album. Taking a page of the collection gets you
four views of the same thing, so each exhibit is drawn from its own random page
and then deduplicated by catalogue prefix.

**Everything fails intermittently, in different ways.** The data API and the
image host have both answered `500` in bursts and recovered a second later, so
requests retry twice — but not on a `4xx`, which is a decision rather than a
hiccup. Thirty-two parallel draws worked until a burst of testing started coming
back empty, so requests are now pooled eight at a time: a boot that quietly
returns no objects is far worse than one that takes another second.

The image hosts are worse. The API has pointed `image` at `api.collectie.gent`,
then stopped carrying image urls at all, then pointed at
`beeldbank-temp.stad.gent`, which answers `403` to everything including its own
`info.json`. The only route that survived all of that is the IIIF manifest — and
measured over 24 random objects, 29% returned one, 63% returned `504`, and the
successes took a median of 17 seconds. Which is why the manifest is used only for
the end-of-run gallery, where nothing is waiting on it and a frame that fills in
twenty seconds later is better than one that never does.

**Rarity comes free with the type index.** `/id/types` publishes an object count
for all 687 type names, which is a rarity table in plain sight: a `bord
(vaatwerk)` is one of 770, and plenty of types have exactly one object. The game
takes the rarest of an object's types, because that is the most specific thing
the catalogue says about it.

The thresholds were measured twice. The first set came from single-type counts
and was far too generous once rarest-of-several was applied — objects carry 1.47
types on average, so taking the minimum drags everything rarer and a museum of
sixteen was turning up two Unicums. Re-measured over 82 real draws, `[1, 5, 20,
80]` lands a random object at Unicum 2%, Zeer zeldzaam 11%, Zeldzaam 15%,
Ongewoon 18%, Gewoon 54% — so a Unicum is about one museum in three. The two
rarest tiers float a gem over the plinth, which is what makes rarity a reason to
cross the room rather than a label in the dex.

**The plinths do not use the museum's photographs, and that is deliberate.**
Crushing a 600px studio photograph onto a 20px plinth produced a smudge, and
downloading sixteen of them delayed every boot to do it. The plinths are drawn
from the object's category instead, and the real photographs appear once, at the
end of a run, in a gallery where they are big enough to be worth looking at.

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

**The end-of-run gallery** is the one place a photograph is shown. It uses a
plain `<img>` rather than a canvas, so no CORS handshake is needed — displaying
an image does not require reading its pixels, only pixelating it did.

Each frame holds two layers: the drawn object underneath, always, and the
photograph over it, revealed only once it decodes. The drawing is the resting
state rather than a placeholder, which is what makes the slow and unreliable
manifest route usable — no frame is ever blank, nothing is waiting, and a
photograph that arrives twenty seconds later simply replaces the drawing. That
the drawing has to be checked with `naturalWidth > 0` rather than trusted is the
museum's fault: its dead image host answers 403 with an HTML page, which the
browser reports as a *successful* load with zero dimensions.

**The Museumdex exports live.** The download button re-fetches each found object
from the API at the moment it is pressed and writes out the complete catalogue
record, not the handful of fields the pixel font can show.

**Everything loads once, up front.** All 16 objects and the type index are
fetched behind the loading screen before Phaser starts — one request per object
and one for the whole rarity table, in parallel — so walking between wings never
waits on the network. A room change only throws away tile sprites and adds new
ones from textures that already exist.

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
