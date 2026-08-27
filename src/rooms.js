// ==========================================
// THE MUSEUM FLOOR PLAN
// ==========================================
//
// Rooms are authored as text, one character per tile. Adding a plinth here is
// all it takes: the fetch count, the textures, the dex grouping and the progress
// counter all follow.

const ROOMS = [
    {
        key: 'inkomhal',
        nameKey: 'room.inkomhal',
        rows: [
            '###############',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '#......#......1',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '#.............#',
            '######2########'
        ],
        exits: {
            1: { to: 'keramiek', at: [1, 4] },
            2: { to: 'meubels',  at: [6, 1] }
        }
    },
    {
        key: 'keramiek',
        nameKey: 'room.keramiek',
        rows: [
            '###############',
            '#....E...E....#',
            '#.............#',
            '#.....###.....#',
            '1.............#',
            '#.............#',
            '#....E...E....#',
            '#.............#',
            '#.............#',
            '########2######'
        ],
        exits: {
            1: { to: 'inkomhal', at: [13, 4] },
            2: { to: 'design',   at: [8, 1] }
        }
    },
    {
        key: 'meubels',
        nameKey: 'room.meubels',
        rows: [
            '######1########',
            '#.............#',
            '#..E.......E..#',
            '#.............#',
            '#.###.....###.2',
            '#.............#',
            '#..E.......E..#',
            '#.............#',
            '#.............#',
            '###############'
        ],
        exits: {
            1: { to: 'inkomhal', at: [6, 8] },
            2: { to: 'design',   at: [1, 4] }
        }
    },
    {
        key: 'design',
        nameKey: 'room.design',
        rows: [
            '########1######',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '2......#......#',
            '#.............#',
            '#...E.....E...#',
            '#.............#',
            '#.............#',
            '###############'
        ],
        exits: {
            1: { to: 'keramiek', at: [8, 8] },
            2: { to: 'meubels',  at: [13, 4] }
        }
    }
];

// Doorways live well above any exhibit value, so the two can never collide.
const DOOR_BASE = 100;

function isDoorTile(tileValue) {
    return tileValue >= DOOR_BASE;
}

function doorKeyFor(tileValue) {
    return tileValue - DOOR_BASE;
}

// Turn the authored text into a numeric grid, handing out exhibit tile values
// from `nextValue` upwards in reading order.
function compileRoom(room, nextValue) {
    const grid = [];
    const exhibitTiles = [];

    room.rows.forEach(row => {
        const line = [];
        for (const character of row) {
            if (character === '#') {
                line.push(1);
            } else if (character === 'E') {
                line.push(nextValue);
                exhibitTiles.push(nextValue);
                nextValue++;
            } else if (character >= '1' && character <= '9') {
                line.push(DOOR_BASE + Number(character));
            } else {
                line.push(0);
            }
        }
        grid.push(line);
    });

    room.grid = grid;
    room.exhibitTiles = exhibitTiles;
    return nextValue;
}

// Compile every room up front, so exhibit tile values run 2, 3, 4... across
// the whole museum rather than restarting in each room. How many exhibits to
// fetch falls out of the floor plan rather than being repeated as a number.
let EXHIBIT_SLOTS = 0;
(function compileAllRooms() {
    let next = 2;
    ROOMS.forEach(room => { next = compileRoom(room, next); });
    EXHIBIT_SLOTS = next - 2;
})();

// The wing's name as the player sees it. Looked up rather than stored on the
// room, so a translation reaches the HUD, the dex headings and the export.
function roomName(room) {
    return t(room.nameKey);
}

function roomIndexByKey(key) {
    return ROOMS.findIndex(room => room.key === key);
}
