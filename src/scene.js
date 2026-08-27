// ==========================================
// THE PHASER SCENE
// ==========================================

class MuseumScene extends Phaser.Scene {
    constructor() {
        super('MuseumScene');
    }

    create() {
        // --- Build every texture before anything tries to use one ---
        makeFloorTexture(this, 'floor-a', PALETTE.marbleA);
        makeFloorTexture(this, 'floor-b', PALETTE.marbleB);
        makeWallTexture(this);
        makeExhibitTextures(this);
        makePlayerTexture(this);
        makeMarkerTextures(this);
        makeMarlotTexture(this);
        makeDoorTexture(this);
        makeWarnTexture(this);

        // Walk cycles — row order matches the spritesheet built above.
        this.anims.create({ key: 'walk-down',  frames: this.anims.generateFrameNumbers('playerSprite', { start: 0,  end: 3  }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-left',  frames: this.anims.generateFrameNumbers('playerSprite', { start: 4,  end: 7  }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('playerSprite', { start: 8,  end: 11 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-up',    frames: this.anims.generateFrameNumbers('playerSprite', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

        // Idle frame per facing = the "stand" frame of that row.
        this.idleFrames = { down: 0, left: 4, right: 8, up: 12 };

        this.tileSize = 32;
        const mapWidthInPixels = ROOMS[0].grid[0].length * this.tileSize;
        const mapHeightInPixels = ROOMS[0].grid.length * this.tileSize;

        // Every room is the same size, so the viewport never has to change.
        // The tile layer is rebuilt on each room change; the player, MARLOT
        // and the hint chevron are made once and carried between rooms.
        this.roomLayer = this.add.container(0, 0);
        this.exhibitSprites = {};
        this.roomIndex = 0;

        // --- Player ---
        this.facing = 'down';
        this.player = this.add.sprite(0, 0, 'playerSprite');
        this.player.setDepth(10);
        this.player.setFrame(this.idleFrames.down);

        // A fixed pool; the difficulty table decides how many are in play.
        this.marlots = [0, 1, 2].map(i => new Marlot(this, i));

        this.runElapsed = 0;
        GameState.gameOver = false;

        // --- Interaction hint marker ---
        // Built before the first room, because buildRoom() hides it.
        this.hint = this.add.image(0, 0, 'hint');
        this.hint.setDepth(20);
        this.hint.setVisible(false);
        this.tweens.add({
            targets: this.hint,
            y: '-=4',
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Draw the opening room and drop the player into it.
        this.buildRoom(0, [2, 6]);

        // --- Controls ---
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');
        this.isMoving = false;

        this.input.keyboard.on('keydown-SPACE', this.handleInteraction, this);
        this.input.keyboard.on('keydown-ENTER', this.handleInteraction, this);
        this.input.keyboard.on('keydown-P', () => togglePokedex());
        this.input.keyboard.on('keydown-ESC', () => {
            if (GameState.dexOpen) togglePokedex();
        });

        // --- Camera ---
        // The viewport is exactly the size of the map, so the whole museum is
        // on screen at once and the camera never has to scroll.
        this.cameras.main.setBounds(0, 0, mapWidthInPixels, mapHeightInPixels);
        this.cameras.main.setBackgroundColor('#1a1a20');

        updateProgressCounter();

        // Textures are built and every room is ready to be drawn from them —
        // this is the first moment the museum is actually playable.
        finishLoading();
    }

    update(time, delta) {
        this.updateHint();

        // Clamp the frame step before it reaches anything that accumulates.
        // A non-finite delta would poison these counters permanently, and a
        // huge one (backgrounded tab, paused debugger) would swallow a whole
        // telegraph window and kill the player with no warning shown.
        const dt = Number.isFinite(delta) ? Math.min(delta, 100) : 0;

        if (!uiIsBlocking()) this.runElapsed += dt;

        const threat = this.currentThreat();
        const cfg = difficultyFor(threat);
        updateDangerMeter(threat);

        // uiIsBlocking() covers game over too, so she freezes on death and
        // while any overlay is up.
        if (!uiIsBlocking()) {
            this.marlots.forEach((marlot, i) => {
                if (i < cfg.count) marlot.update(dt, cfg);
                else if (marlot.isPresent) marlot.retire();
            });
            this.checkMarlotCollision();
        }

        if (uiIsBlocking() || this.isMoving) return;

        let nextX = this.playerGridX;
        let nextY = this.playerGridY;
        let direction = null;

        if (this.cursors.left.isDown || this.wasd.A.isDown)       { nextX--; direction = 'left';  }
        else if (this.cursors.right.isDown || this.wasd.D.isDown) { nextX++; direction = 'right'; }
        else if (this.cursors.up.isDown || this.wasd.W.isDown)    { nextY--; direction = 'up';    }
        else if (this.cursors.down.isDown || this.wasd.S.isDown)  { nextY++; direction = 'down';  }

        if (!direction) return;

        // Turn to face the way you pressed even when the path is blocked —
        // this is what lets you stand still and look at an exhibit.
        this.facing = direction;

        if (this.canEnter(nextX, nextY)) {
            this.movePlayer(nextX, nextY, direction);
        } else {
            this.player.setFrame(this.idleFrames[direction]);
        }
    }

    // --- Rooms --------------------------------------------------------
    // Everything expensive — the API fetch, the photo downloads, the pixelated
    // exhibit textures — happened once before the game started. A room change
    // only throws away tile sprites and adds new ones from textures that
    // already exist, so it costs no network and no drawing.

    buildRoom(index, spawn) {
        const room = ROOMS[index];
        this.roomIndex = index;
        this.mapGrid = room.grid.map(row => row.slice());

        // Drop the previous room's tiles. destroy(true) takes the children
        // with it, which is what stops sprites accumulating room after room.
        this.roomLayer.removeAll(true);
        this.exhibitSprites = {};

        for (let y = 0; y < this.mapGrid.length; y++) {
            for (let x = 0; x < this.mapGrid[y].length; x++) {
                const tileType = this.mapGrid[y][x];
                const posX = x * this.tileSize + (this.tileSize / 2);
                const posY = y * this.tileSize + (this.tileSize / 2);

                if (tileType === 1) {
                    this.roomLayer.add(this.add.image(posX, posY, 'wall'));
                } else {
                    // Every non-wall tile gets marble underneath it, so the
                    // exhibits and doorways sit on a floor rather than on
                    // nothing.
                    this.roomLayer.add(
                        this.add.image(posX, posY, (x + y) % 2 === 0 ? 'floor-a' : 'floor-b')
                    );
                }

                if (isDoorTile(tileType)) {
                    const door = this.add.image(posX, posY, 'door');
                    door.setDepth(4);
                    this.roomLayer.add(door);
                }

                if (isExhibitTile(tileType)) {
                    const sprite = this.add.image(posX, posY, 'exhibit-' + tileType);
                    sprite.setDepth(5);
                    this.roomLayer.add(sprite);
                    this.exhibitSprites[x + ',' + y] = sprite;

                    this.markRarity(x, y, tileType);

                    // Anything already in the dex keeps its tick when you come
                    // back to the room that holds it.
                    if (GameState.sessionPokedex.has('exhibit_' + tileType)) {
                        this.roomLayer.add(this.makeBadge(x, y, false));
                    }
                }
            }
        }

        // Place the player, then work out where MARLOT is allowed to appear.
        this.playerGridX = spawn[0];
        this.playerGridY = spawn[1];
        this.player.setPosition(
            this.playerGridX * this.tileSize + (this.tileSize / 2),
            this.playerGridY * this.tileSize + (this.tileSize / 2)
        );
        this.player.setFrame(this.idleFrames[this.facing]);
        this.isMoving = false;

        // Flood fill from the player so she can only ever appear somewhere the
        // player can actually reach. Once per room, rather than rejection
        // sampling against walls on every spawn.
        this.walkableTiles = this.computeReachableTiles(this.playerGridX, this.playerGridY);

        // She does not follow you through a doorway — every room starts clear.
        this.marlots.forEach(marlot => marlot.retire());

        this.hint.setVisible(false);
        updateRoomLabel(room);
    }

    // Step onto a doorway and you are in the next room.
    useDoor(tileValue) {
        const exit = ROOMS[this.roomIndex].exits[doorKeyFor(tileValue)];
        if (!exit) return;

        const target = roomIndexByKey(exit.to);
        if (target < 0) {
            console.warn('Museumdex: no room keyed ' + exit.to);
            return;
        }

        this.cameras.main.fadeOut(120, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.buildRoom(target, exit.at);
            this.cameras.main.fadeIn(160, 0, 0, 0);
            showToast(roomName(ROOMS[target]));
        });
    }

    // A gem floating over the two rarest tiers. Deliberately visible before you
    // inspect anything: it tells you which plinth to reach first, which is what
    // turns rarity from a label in the dex into a reason to cross the room.
    markRarity(x, y, tileValue) {
        const rarity = (MuseumAPI['exhibit_' + tileValue] || {}).rarity;
        if (!rarity) return;

        const key = rarity.key === 'unicum' ? 'gem-unicum'
                  : rarity.key === 'zeer'   ? 'gem-zeer'
                  : null;
        if (!key) return;

        const gem = this.add.image(
            x * this.tileSize + 8,
            y * this.tileSize + 7,
            key
        );
        gem.setDepth(6);
        this.roomLayer.add(gem);

        this.tweens.add({
            targets: gem,
            y: gem.y - 3,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    // A tick over a discovered exhibit. Popped in when it is earned, already
    // in place when you re-enter the room.
    makeBadge(x, y, animate) {
        const badge = this.add.image(
            x * this.tileSize + this.tileSize - 8,
            y * this.tileSize + 8,
            'check'
        );
        badge.setDepth(6);

        if (animate) {
            badge.setScale(0);
            this.tweens.add({ targets: badge, scale: 1, duration: 250, ease: 'Back.easeOut' });
        }
        return badge;
    }

    // --- MARLOT support ---------------------------------------------

    currentThreat() {
        if (GameState.threatOverride !== null) return GameState.threatOverride;

        // Squared so the opening stretch stays genuinely gentle, plus a step
        // for each discovery — she gets angrier every time you take something.
        const ramp = Phaser.Math.Clamp(this.runElapsed / RAMP_MS, 0, 1);
        return Phaser.Math.Clamp(ramp * ramp + GameState.sessionPokedex.size * 0.15, 0, 1);
    }

    // Where MARLOT may stand: plain floor only. Keeping her out of doorways
    // means she can never block the one tile you need to leave by.
    isWalkable(x, y) {
        return !!this.mapGrid[y] && this.mapGrid[y][x] === 0;
    }

    // Where the player may step: floor, or a doorway leading out of the room.
    canEnter(x, y) {
        if (!this.mapGrid[y]) return false;
        const tile = this.mapGrid[y][x];
        return tile === 0 || isDoorTile(tile);
    }

    tileHasMarlot(x, y, except) {
        return this.marlots.some(m =>
            m !== except && m.isPresent && m.gridX === x && m.gridY === y);
    }

    computeReachableTiles(startX, startY) {
        const seen = new Set([startX + ',' + startY]);
        const tiles = [{ x: startX, y: startY }];
        const queue = [{ x: startX, y: startY }];

        while (queue.length) {
            const { x, y } = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                const key = nx + ',' + ny;
                if (seen.has(key) || !this.isWalkable(nx, ny)) continue;
                seen.add(key);
                tiles.push({ x: nx, y: ny });
                queue.push({ x: nx, y: ny });
            }
        }
        return tiles;
    }

    // The fairness layer. Note that movePlayer() assigns playerGridX/Y at the
    // START of a step, so the player's logical tile is already their
    // destination for the whole 150ms tween — excluding it here is what stops
    // her materialising on a move you had already committed to.
    pickSpawnTile(cfg, forMarlot) {
        const px = this.playerGridX;
        const py = this.playerGridY;

        const candidates = this.walkableTiles.filter(t => {
            if (t.x === px && t.y === py) return false;
            if (this.tileHasMarlot(t.x, t.y, forMarlot)) return false;
            if (Math.abs(t.x - px) + Math.abs(t.y - py) < cfg.minDistance) return false;
            return this.playerKeepsAnEscape(t.x, t.y, forMarlot);
        });

        return candidates.length ? Phaser.Utils.Array.GetRandom(candidates) : null;
    }

    // Never leave the player boxed in with nowhere to step.
    playerKeepsAnEscape(spawnX, spawnY, ignore) {
        const px = this.playerGridX;
        const py = this.playerGridY;

        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = px + dx, ny = py + dy;
            if (!this.isWalkable(nx, ny)) return false;
            if (nx === spawnX && ny === spawnY) return false;
            return !this.tileHasMarlot(nx, ny, ignore);
        });
    }

    checkMarlotCollision() {
        if (GameState.gameOver) return;

        const caught = this.marlots.find(m =>
            m.isLethal && m.gridX === this.playerGridX && m.gridY === this.playerGridY);

        if (caught) this.failRun();
    }

    failRun() {
        GameState.gameOver = true;
        this.isMoving = false;
        this.tweens.killTweensOf(this.player);
        this.player.anims.stop();
        this.hint.setVisible(false);

        this.cameras.main.shake(260, 0.012);
        this.cameras.main.flash(320, 190, 40, 90);

        showGameOver({
            found: GameState.sessionPokedex.size,
            ms: this.runElapsed,
            threat: this.currentThreat()
        });
    }

    // Float the chevron over an exhibit whenever the player is standing
    // in front of one (i.e. directly below it).
    updateHint() {
        const target = this.exhibitInFront();

        if (!target || uiIsBlocking()) {
            this.hint.setVisible(false);
            return;
        }

        const markerX = target.x * this.tileSize + (this.tileSize / 2);
        const markerY = target.y * this.tileSize - 6;

        if (!this.hint.visible) {
            this.hint.setVisible(true);
            this.hint.setPosition(markerX, markerY);
            // Re-seat the hover tween on the new anchor point.
            this.tweens.killTweensOf(this.hint);
            this.tweens.add({
                targets: this.hint,
                y: markerY - 4,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    // The exhibit tile directly above the player, if there is one.
    exhibitInFront() {
        const y = this.playerGridY - 1;
        const x = this.playerGridX;
        if (y < 0 || !this.mapGrid[y]) return null;

        const tile = this.mapGrid[y][x];
        if (!isExhibitTile(tile)) return null;

        return { x, y, tile };
    }

    movePlayer(newX, newY, direction) {
        this.isMoving = true;
        this.player.play('walk-' + direction, true);

        this.playerGridX = newX;
        this.playerGridY = newY;

        this.tweens.add({
            targets: this.player,
            x: newX * this.tileSize + (this.tileSize / 2),
            y: newY * this.tileSize + (this.tileSize / 2),
            duration: 150,
            onComplete: () => {
                this.isMoving = false;
                this.player.anims.stop();
                // Settle on the idle pose for whichever way we ended up facing.
                this.player.setFrame(this.idleFrames[this.facing]);

                // The doorway fires on arrival rather than on the keypress, so
                // you see yourself step into it before the room changes.
                const landed = this.mapGrid[newY] && this.mapGrid[newY][newX];
                if (isDoorTile(landed)) this.useDoor(landed);
            }
        });
    }

    handleInteraction() {
        if (GameState.dexOpen) return;   // the dex has its own controls

        if (GameState.isReading) {
            // First press finishes the typewriter, second press closes.
            if (isTyping()) {
                finishTyping();
            } else {
                closeDialogue();
            }
            return;
        }

        const target = this.exhibitInFront();
        if (!target) return;

        const apiId = "exhibit_" + target.tile;
        const exhibitData = MuseumAPI[apiId];
        if (!exhibitData) return;

        const isNew = !GameState.sessionPokedex.has(apiId);
        GameState.sessionPokedex.add(apiId);

        // Face the exhibit and stop dead.
        this.facing = 'up';
        this.player.anims.stop();
        this.player.setFrame(this.idleFrames.up);
        this.hint.setVisible(false);

        if (isNew) {
            this.badgeExhibits(target.tile);
            updateProgressCounter();

            // A common find gets the plain line; a rare one is worth saying out
            // loud, since it is the reason to keep looking.
            const rarity = exhibitData.rarity;
            if (rarity && (rarity.key === 'unicum' || rarity.key === 'zeer')) {
                showToast(t('discovery.rare', {
                    tier: rarity.label.toUpperCase(),
                    count: rarity.count
                }));
            } else {
                showToast(t('discovery.new'));
            }
        }

        openDialogue(exhibitData.name, trimForDialogue(exhibitData.description), isNew);
    }

    // Stamp a tick on every tile showing this exhibit, not just the one that
    // happened to be read. The badge joins the room layer so it is cleared
    // along with the rest of the room, then redrawn from the dex on return.
    badgeExhibits(tileType) {
        for (const key in this.exhibitSprites) {
            const [x, y] = key.split(',').map(Number);
            if (this.mapGrid[y][x] !== tileType) continue;
            this.roomLayer.add(this.makeBadge(x, y, true));
        }
    }
}
