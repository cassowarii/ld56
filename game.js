"use strict";

let game;

let game_started = false;

let just_started = true;

let level_number = 1;

let map;

let intitle;
let wonitall;

/* --------- definitions ---------- */

/* state:
 * STAND: doing some kind of selection, or waiting
 * MOVE: creature is moving
 * WIN: level complete
 */
let State = { STAND: 0, MOVE: 1, WIN: 2 };

let can_continue = false;

let save_data = 1;
const SAVE_KEY = "casso.lizardwizard.save"

zb.ready(function() {
    game = zb.create_game({
        canvas: 'canvas',
        canvas_w: 480,
        canvas_h: 720,
        draw_scale: 3,
        tile_size: 20,
        level_w: 8,
        level_h: 12,
        background_color: '#41522E',
        draw_func: do_draw,
        update_func: do_update,
        run_in_background: true,
        save_key: SAVE_KEY,
        state: State.STAND,
        events: {
            keyup: handle_keyup,
            mouseup: handle_mouseup,
            mousedown: handle_mousedown,
            mousemove: handle_mousemove,
            gamestart: handle_gamestart,
        },
        buttons: [
            {
                id: 0,
                callback: undo,
                x: 28,
                y: 0,
            },
            {
                id: 1,
                callback: reset,
                x: 44,
                y: 0,
            },
            {
                id: 2,
                callback: mute_button,
                x: 116,
                y: 0,
            },
            {
                id: 4,
                callback: colorblind_button,
                x: 100,
                y: 0,
            },
        ],
    });

    game.register_images({
        creatures: 'img/creatures.png',
        tiles: 'img/tiles.png',
        selector: 'img/selector.png',
        markers: 'img/markers.png',
        shine: 'img/shine.png',
        sparkle: 'img/sparkle.png',
        levelnums: 'img/levelnums.png',
        clicktocontinue: 'img/clicktocontinue.png',
        buttons: 'img/buttons.png',
        titlescreen: 'img/titlescreen.png',
        endscreen: 'img/endscreen.png',
        leveltext: {
            1: 'img/level/1.png',
            2: 'img/level/2.png',
            4: 'img/level/4.png',
            7: 'img/level/7.png',
            9: 'img/level/9.png',
        }
    });

    game.register_sfx({
        win: {
            path: 'sfx/win.wav',
            volume: 0.95,
        },
        hop: {
            path: 'sfx/win.wav',
            volume: 0.95,
        },
    });

    game.register_music({
        bgm: {
            path: 'music/bugjazz',
            volume: 0.9,
        },
        feet: {
            path: 'sfx/feet.wav',
            volume: 1.0,
        },
        slide: {
            path: 'sfx/slide.wav',
            volume: 1.0,
        },
    });

    game.resources_ready();

    game.transition.color = game.background_color;

    for (let b of game.buttons) {
        b.state = 0;
    }
});

let ID = {
    ladybug: 0,
    frog: 1,
    spider: 2,
    snailV: 3,
    snailH: 4,
    stagbeetleV: 5,
    stagbeetleH: 6,
};

let mapID = {
    blank: 0,
    normal: 1,
    blue: 2,
    red: 3,
    access: 4,
};

let creatureColorID = {
    red: 0,
    blue: 1,
}

let move_speeds = {
    [ID.ladybug]: 6,
    [ID.frog]: 3,
    [ID.spider]: 4,
    [ID.snailV]: 3,
    [ID.snailH]: 3,
    [ID.stagbeetleV]: 5,
    [ID.stagbeetleH]: 5,
};

let can_push = {
    [ID.stagbeetleV]: 1,
    [ID.stagbeetleH]: 1,
};

function mute_button() {
    game.toggle_mute();
    if (game.muted) {
        game.buttons[2].id = 3;
    } else {
        game.buttons[2].id = 2;
    }
}

function colorblind_button() {
    draw_markers = !draw_markers;
    if (draw_markers) {
        game.buttons[3].id = 5;
    } else {
        game.buttons[3].id = 4;
    }
}

/* ------ timers & static timer values --------- */

let access_flash_timer = 0;

let clicktocontinue_opacity = 0;
const CTC_FADEIN_SPEED = 0.8;

let shine_progress = 0;
const SHINE_IN_LENGTH = 0.2;
const SHINE_OUT_LENGTH = 0.5;
const SHINE_SPEED = 2.8;
const MAX_SHINE_OPACITY = 0.4;

const SPARKLE_GAP = 1.8;
const SPARKLE_FRAME_LENGTH = 100;

/* ------- game global state -------- */

let creatures = [];

let selected_creature = null;
let moving_creatures = [];

let accessible_tiles = new Set();

let pathfinding = {};
let path = [];

let selector_info = null;

let draw_markers = false;

let sparkles = [];

/* ------- game behavior functions -------- */

let find_accessible_tiles = {
    [ID.ladybug]: function(x, y) {
        return [ [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1] ];
    },

    [ID.frog]: function(x, y) {
        return [ [x + 1, y + 2], [x + 1, y - 2], [x - 1, y + 2], [x - 1, y - 2], [x + 2, y + 1], [x + 2, y - 1], [x - 2, y + 1], [x - 2, y - 1] ];
    },

    [ID.spider]: function(x, y) {
        return [ [x + 1, y + 1], [x + 1, y - 1], [x - 1, y + 1], [x - 1, y - 1] ];
    },

    [ID.snailV]: function(x, y) {
        return [ [x, y + 1], [x, y - 1] ];
    },

    [ID.snailH]: function(x, y) {
        return [ [x + 1, y], [x - 1, y] ];
    },

    [ID.stagbeetleV]: function(x, y) {
        return [ [x, y + 1], [x, y - 1] ];
    },

    [ID.stagbeetleH]: function(x, y) {
        return [ [x + 1, y], [x - 1, y] ];
    },
};

function snail_walk(ctx, x, y, tx, ty, mf, creature) {
    if (y < ty) { creature.vflip = true }
           else { creature.vflip = false }
    if (x < tx) { creature.hflip = true }
           else { creature.hflip = false }

    if (mf >= 0.25 && mf < 0.75) return 0;
    return 1;
}

function beetle_walk(ctx, x, y, tx, ty, mf, creature) {
    if (y < ty) { creature.vflip = true }
           else { creature.vflip = false }
    if (x < tx) { creature.hflip = true }
           else { creature.hflip = false }

    if (mf < 0.25 || mf >= 0.5 && mf < 0.75) return 0;
    return 1;
}

/* These functions take a canvas context, as well as the creature's
 * x, y, target_x, target_y, and move_fraction as parameters,
 * and then maybe do something to the drawing canvas before the
 * creature gets drawn. (rotate, offset, flip, etc), and then
 * return the frame that the creature should draw. */
let display_when_in_motion = {
    [ID.ladybug]: function (ctx, x, y, tx, ty, mf, creature) {
             if (ty < y) { creature.rotate = 0 }
        else if (tx > x) { creature.rotate = 90 }
        else if (ty > y) { creature.rotate = 180 }
        else if (tx < x) { creature.rotate = 270 }

        if (mf >= 0.25 && mf < 0.75) return 0;
        return 1;
    },

    [ID.frog]: function (ctx, x, y, tx, ty, mf, creature) {
        if (tx > x) { creature.hflip = true }
               else { creature.hflip = false }

        let y_offset = (4 * Math.pow(mf, 2) - 4 * mf) * 30;
        ctx.translate(0, y_offset);

        if (mf < 0.8) return 1;
        return 0;
    },

    [ID.spider]: function (ctx, x, y, tx, ty, mf, creature) {
        if (mf < 0.125 || mf >= 0.375 && mf < 0.5 || mf >= 0.875) return 1;
        return 0;
    },

    [ID.snailH]: snail_walk,

    [ID.snailV]: snail_walk,

    [ID.stagbeetleH]: beetle_walk,

    [ID.stagbeetleV]: beetle_walk,
};

function sofc(coords) {
    return "" + coords[0] + "," + coords[1];
}

function cofs(string) {
    return string.split(",").map(a => parseInt(a, 10));
}

function compute_accessible_tiles_for_creature(creature) {
    pathfinding = {};
    accessible_tiles.clear();

    if (creature.type === ID.stagbeetleH) {
        let look_x = creature.x;
        let creature_count = 0;
        for (let look_x = creature.x + 1; ; look_x ++) {
            if (creatures_at(look_x + creature_count, creature.y).length > 0) creature_count ++;
            if (creatures_at(look_x + creature_count, creature.y).length > 0) creature_count ++;
            if (creature_count > 1) break;
            if (tile_at(look_x + creature_count, creature.y) === 0) break;
            accessible_tiles.add(sofc([look_x, creature.y]));
            pathfinding[sofc([look_x, creature.y])] = sofc([look_x - 1, creature.y]);
        }

        creature_count = 0;
        for (let look_x = creature.x - 1; ; look_x --) {
            if (creatures_at(look_x - creature_count, creature.y).length > 0) creature_count ++;
            if (creatures_at(look_x - creature_count, creature.y).length > 0) creature_count ++;
            if (creature_count > 1) break;
            if (tile_at(look_x - creature_count, creature.y) === 0) break;
            accessible_tiles.add(sofc([look_x, creature.y]));
            pathfinding[sofc([look_x, creature.y])] = sofc([look_x + 1, creature.y]);
        }
    } else if (creature.type === ID.stagbeetleV) {
        let look_y = creature.y;
        let creature_count = 0;
        for (let look_y = creature.y + 1; ; look_y ++) {
            if (creatures_at(creature.x, look_y + creature_count).length > 0) creature_count ++;
            if (creatures_at(creature.x, look_y + creature_count).length > 0) creature_count ++;
            if (creature_count > 1) break;
            if (tile_at(creature.x, look_y + creature_count) === 0) break;
            accessible_tiles.add(sofc([creature.x, look_y]));
            pathfinding[sofc([creature.x, look_y])] = sofc([creature.x, look_y - 1]);
        }

        creature_count = 0;
        for (let look_y = creature.y - 1; ; look_y --) {
            if (creatures_at(creature.x, look_y - creature_count).length > 0) creature_count ++;
            if (creatures_at(creature.x, look_y - creature_count).length > 0) creature_count ++;
            if (creature_count > 1) break;
            if (tile_at(creature.x, look_y - creature_count) === 0) break;
            accessible_tiles.add(sofc([creature.x, look_y]));
            pathfinding[sofc([creature.x, look_y])] = sofc([creature.x, look_y + 1]);
        }
    } else {
        accessible_tiles.add(sofc([ creature.x, creature.y ]));

        /* repeatedly call the 'find accessible tiles' function on all the tiles already in the set,
         * until we don't add any new ones - this is pretty inefficient, but the levels are tiny,
         * so who cares! */
        let last_size;
        do {
            last_size = accessible_tiles.size;

            for (let sAlready of accessible_tiles.values()) {
                /* sorry, this is kind of insane, we convert them to a string so that we can tell if
                 * a coordinate is already in the set... but then we convert the string back into
                 * coordinates in order ot pass them to find_accessible_tiles... spaghetti code */
                let found = find_accessible_tiles[creature.type](...cofs(sAlready));
                for (let cFound of found) {
                    /* tile only accessible if no creature already there and if the tile is not 0 
                     * (and also out of bounds check) */
                    if (creatures_at(...cFound).length !== 0 && !can_push[creature.type]) continue;
                    if (tile_at(...cFound) === 0) continue;
                    if (cFound[0] < 0 || cFound[0] >= game.level_w || cFound[1] < 0 || cFound[1] >= game.level_h) continue;

                    if (!accessible_tiles.has(sofc(cFound))) {
                        /* Mark how we found the path to this tile so that we can follow it later
                         * if we want to! */
                        pathfinding[sofc(cFound)] = sAlready;
                        accessible_tiles.add(sofc(cFound));
                    }
                }
            }
        } while (last_size != accessible_tiles.size);

        accessible_tiles.delete(sofc([ creature.x, creature.y ]));
    }
}

function do_single_move(c, tx, ty, first) {
    if (c === selected_creature) {
        if (c.type === ID.frog) {
            game.sfx.hop.play();
        } else if (first) {
            if (c.type === ID.snailH || c.type === ID.snailV) {
                game.music.slide.play();
            } else {
                game.music.feet.play();
            }
        }
    }

    c.target_x = path[0][0];
    c.target_y = path[0][1];
    c.move_fraction = 0;

    if (c === selected_creature && can_push[c.type]) {
        /* If there's a creature in the way on the tile we're moving to, then
         * push it */
        let creatures = creatures_at(c.target_x, c.target_y);
        if (creatures.length > 0) {
            console.log("pushing");
            creatures[0].target_x = creatures[0].x + c.target_x - c.x;
            creatures[0].target_y = creatures[0].y + c.target_y - c.y;
            if (!moving_creatures.includes(creatures[0])) {
                moving_creatures.push(creatures[0]);
            }
        }
    }
}

/* ------- generic functions -------- */

function delete_save() {
    try {
        game.save('level_num', 1);
    } catch (e) {
        console.error("oops, can't save! though that uh... doesn't matter here");
    }
}

function save() {
    try {
        console.log("Saving");
        let save_data = level_number;
        if (game.state === State.WIN) {
            save_data = level_number + 1;
        }
        game.save('level_num', save_data);
    } catch (e) {
        console.error("oops, can't save!", e);
    }
}

function handle_gamestart(game) {
    console.log("Game start!");

    intitle = true;
    wonitall = false;

    let save_data = parseInt(game.load('level_num') || "1");
    console.log("save data: ", save_data);
    level_number = save_data;
    if (level_number > Math.max(...Object.keys(levels).map(a => parseInt(a, 10) || 0))) {
        level_number = 1;
    }
    load_level_data(levels.title);
}

function creatures_at(x, y) {
    return creatures.filter(o => o.x === x && o.y === y);
}

function tile_at(x, y) {
    let result = map[y * game.level_w + x];
    if (result > 4) return 0;
    return result;
}

function cosmetic_tile_at(x, y) {
    return map[y * game.level_w + x];
}

let undo_stack = [];

function create_undo_point() {
    console.log("cup");
    undo_stack.push(zb.copy_flat_objlist(creatures));
}

function undo() {
    console.log("undo")
    if (undo_stack.length > 0) {
        creatures = undo_stack.pop();
        selected_creature = null;
        game.state = State.STAND;
        accessible_tiles.clear();
        selector_info = null;

        for (let c of creatures) {
            c.move_fraction = 0;
            c.target_x = c.x;
            c.target_y = c.y;
        }
    }
}

function reset() {
    game.start_transition(zb.transition.FADE, 300, function() {
        load_level();
    });
}

function advance_level() {
    if (!can_continue) return;

    console.log("W:", Math.max(...Object.keys(levels).map(a => parseInt(a, 10) || 0)));

    if (level_number + 1 > Math.max(...Object.keys(levels).map(a => parseInt(a, 10) || 0))) {
        win_everything();
        return;
    }

    game.long_transition(zb.transition.FADE, 375, function() {
        level_number ++;
        load_level();
        can_continue = false;
        game.state = State.STAND;
    });
}

function skip_to(num) {
    level_number = num;
    load_level();
}

function win_everything() {
    game.long_transition(zb.transition.FADE, 1000, function() {
        wonitall = true;
        load_level_data(levels.end);
        delete_save();
    });
}

function load_level() {
    load_level_data(levels[level_number]);
}

function load_level_data(lvl) {
    map = lvl.map;
    creatures = zb.copy_flat_objlist(lvl.creatures);

    sparkles = [];

    for (let c of creatures) {
        if (c.type === ID.snailH || c.type === ID.stagbeetleH || c.type === ID.frog) {
            if (c.x < game.level_w / 2) {
                c.hflip = true;
            }
        }

        if (c.type === ID.snailV || c.type === ID.stagbeetleV) {
            if (c.y < game.level_h / 2) {
                c.vflip = true;
            }
        }

        c.move_fraction = 0;

        c.sparkle_timer = Math.random() * SPARKLE_GAP;
    }

    selected_creature = null;
    game.state = State.STAND;
    accessible_tiles.clear();
    selector_info = null;
}

function check_victory() {
    /* Check that every red square has a red creature on it, and every
     * blue square has a blue creature on it */
    for (let y = 0; y < game.level_h; y++) {
        for (let x = 0; x < game.level_w; x++) {
            if (tile_at(x, y) === mapID.blue) {
                let creatures = creatures_at(x, y);
                if (creatures.length === 0 || creatures[0].color === creatureColorID.red) {
                    return false;
                }
            }

            if (tile_at(x, y) === mapID.red) {
                let creatures = creatures_at(x, y);
                if (creatures.length === 0 || creatures[0].color === creatureColorID.blue) {
                    return false;
                }
            }
        }
    }

    win();
}

function win() {
    console.log("You won!");
    selector_info = null;
    selected_creature = null;
    accessible_tiles.clear();
    game.state = State.WIN;
    clicktocontinue_opacity = 0;

    game.sfx.win.play();

    let min_position = game.level_w + game.level_h;
    for (let y = 0; y < game.level_h; y++) {
        for (let x = 0; x < game.level_w; x++) {
            if (tile_at(x, y) !== 0 && x + y < min_position) {
                min_position = x + y;
            }
        }
    }
    shine_progress = min_position / (game.level_w + game.level_h);

    save();
    window.setTimeout(function() {
        can_continue = true;
    }, 350);
}

/* ---------- update functions ------------ */

/* MAIN UPDATE FUNCTION */
function do_update(delta) {
    if (game.state === State.STAND) {
        if (selected_creature) {
            access_flash_timer += delta;
        }
    } else if (game.state === State.MOVE) {
        for (let c of moving_creatures) {
            c.move_fraction += move_speeds[selected_creature.type] * delta / 1000;
        }

        if (selected_creature.move_fraction >= 1) {
            for (let c of moving_creatures) {
                c.x = c.target_x;
                c.y = c.target_y;
                c.move_fraction = 0;
            }

            /* if selected creature completes move, continue path */
            path.shift();
            if (path.length === 0) {
                game.music.feet.pause();
                game.music.slide.pause();
                game.state = State.STAND;
                selected_creature = null;
                moving_creatures = [];
                check_victory();
            } else {
                do_single_move(selected_creature, path[0][0], path[0][1], false);
            }
        }
    } else if (game.state === State.WIN) {
        if (clicktocontinue_opacity < 1) {
            clicktocontinue_opacity += CTC_FADEIN_SPEED * delta / 1000;
            if (clicktocontinue_opacity > 1) {
                clicktocontinue_opacity = 1;
            }
        }

        shine_progress += delta / 1000 / SHINE_SPEED;
    }

    if (game.state !== State.MOVE) {
        for (let c of creatures) {
            if (tile_at(c.x, c.y) === mapID.red && c.color === creatureColorID.red
                    || tile_at(c.x, c.y) === mapID.blue && c.color === creatureColorID.blue) {
                c.sparkling = true;
                c.sparkle_timer += delta / 1000;
                let sparkle_threshold = SPARKLE_GAP * (Math.random() * 0.8 + 0.4);
                if (game.state === State.WIN) {
                    sparkle_threshold /= 1.8;
                }
                if (c.sparkle_timer > sparkle_threshold) {
                    c.sparkle_timer -= sparkle_threshold;

                    let angle = Math.random() * 2 * Math.PI;
                    let magnitude = Math.random() * game.tile_size * 0.2 + game.tile_size * 0.3;
                    sparkles.push({
                        x: c.x * game.tile_size + game.tile_size / 2 + Math.cos(angle) * magnitude,
                        y: c.y * game.tile_size + game.tile_size / 2 + Math.sin(angle) * magnitude,
                        timer: 0,
                        frame: 0,
                    });
                }
            } else {
                c.sparkling = false;
            }
        }
    }

    for (let s of sparkles) {
        s.timer += delta;
        while (s.timer > SPARKLE_FRAME_LENGTH) {
            s.timer -= SPARKLE_FRAME_LENGTH;
            s.frame ++;
        }
        if (s.frame > 4) {
            s.deleteme = true;
        }
    }
    sparkles = sparkles.filter(s => !s.deleteme);
}

/* ---------- draw functions ----------- */

/* DRAW */
function do_draw(ctx) {
    draw_map(ctx);

    draw_creatures(ctx);

    draw_sparkles(ctx);

    if (intitle) {
        zb.screen_draw(ctx, game.img.titlescreen);
    } else if (wonitall) {
        zb.screen_draw(ctx, game.img.endscreen);
    } else {
        draw_buttons(ctx);
    }

    if (game.state === State.WIN) {
        ctx.save();
        ctx.globalAlpha = clicktocontinue_opacity;
        zb.screen_draw(ctx, game.img.clicktocontinue);
        ctx.restore();

        draw_shine(ctx);
    }
}

function draw_map(ctx) {
    if (!intitle && !wonitall) {
        zb.sprite_draw(ctx, game.img.levelnums, 160, 8, 0, level_number - 1, 0, 4);
    }

    for (let y = 0; y < game.level_h; y++) {
        for (let x = 0; x < game.level_w; x++) {
            zb.sprite_draw(ctx, game.img.tiles, game.tile_size, game.tile_size, cosmetic_tile_at(x, y), (x + y) % 2, x * game.tile_size, y * game.tile_size);

            if (selected_creature && accessible_tiles.has(sofc([x, y]))) {
                ctx.save();
                ctx.globalAlpha = Math.sin(access_flash_timer / 1000 * 2 * Math.PI) / 3 + 0.66;
                zb.sprite_draw(ctx, game.img.tiles, game.tile_size, game.tile_size, mapID.access, (x + y) % 2, x * game.tile_size, y * game.tile_size);
                ctx.restore();
            }
        }
    }

    if (!intitle && !wonitall) {
        if (selector_info) {
            ctx.drawImage(game.img.selector, selector_info.x * game.tile_size - 1, selector_info.y * game.tile_size - 1);
        }

        if (selected_creature && game.state === State.STAND) {
            ctx.drawImage(game.img.selector, selected_creature.x * game.tile_size - 1, selected_creature.y * game.tile_size - 1);
        }

        if (draw_markers) {
            for (let y = 0; y < game.level_h; y++) {
                for (let x = 0; x < game.level_w; x++) {
                    if (tile_at(x, y) == 2) {
                        zb.sprite_draw(ctx, game.img.markers, game.tile_size, game.tile_size, 0, 1, x * game.tile_size, y * game.tile_size);
                    } else if (tile_at(x, y) == 3) {
                        zb.sprite_draw(ctx, game.img.markers, game.tile_size, game.tile_size, 0, 0, x * game.tile_size, y * game.tile_size);
                    }
                }
            }
        }

        if (game.img.leveltext.hasOwnProperty(level_number)) {
            zb.screen_draw(ctx, game.img.leveltext[level_number]);
        }
    }
}

function draw_creatures(ctx) {
    for (let c of creatures) {
        draw_creature(ctx, c);
    }

    for (let c of moving_creatures) {
        /* Draw moving creatures on top of other ones */
        draw_creature(ctx, c);
    }
}

function draw_sparkles(ctx) {
    for (let s of sparkles) {
        zb.sprite_draw(ctx, game.img.sparkle, 7, 7, 0, s.frame, s.x - 3, s.y - 3);
    }
}

function draw_creature(ctx, c) {
    ctx.save();

    let frame = 0;
    let display_x = c.x * game.tile_size;
    let display_y = c.y * game.tile_size;
    if (moving_creatures.includes(c) && game.state === State.MOVE) {
        display_x = c.x * game.tile_size * (1 - c.move_fraction) + c.target_x * game.tile_size * c.move_fraction;
        display_y = c.y * game.tile_size * (1 - c.move_fraction) + c.target_y * game.tile_size * c.move_fraction;
    }

    ctx.translate(display_x, display_y);

    if (!moving_creatures.includes(c) && draw_markers) {
        zb.sprite_draw(ctx, game.img.markers, game.tile_size, game.tile_size, 1, c.color, 0, 0);
    }

    if (c.hflip) {
        ctx.translate(game.tile_size, 0);
        ctx.scale(-1, 1);
    }

    if (c.vflip) {
        ctx.translate(0, game.tile_size);
        ctx.scale(1, -1);
    }

    if (c.rotate) {
        ctx.translate(game.tile_size / 2, game.tile_size / 2);
        ctx.rotate(c.rotate * Math.PI / 180);
        ctx.translate(-game.tile_size / 2, -game.tile_size / 2);
    }

    if (c === selected_creature && game.state === State.MOVE) {
        frame = display_when_in_motion[c.type](ctx, c.x, c.y, c.target_x, c.target_y, c.move_fraction, c);
    }

    zb.sprite_draw(ctx, game.img.creatures, game.tile_size + 2, game.tile_size + 2, c.type, frame * 2 + c.color, -1, -1);

    ctx.restore();
}

function draw_buttons(ctx) {
    for (let b of game.buttons) {
        zb.sprite_draw(ctx, game.img.buttons, 16, 16, b.id, b.state, b.x, b.y);
    }
}

function draw_shine(ctx) {
    if (game.state === State.WIN) {
        for (let y = 0; y < game.level_h; y++) {
            for (let x = 0; x < game.level_w; x++) {
                if (tile_at(x, y) == 0) continue;

                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                let shine_threshold = (x + y) / (game.level_w + game.level_h);
                if (shine_progress > shine_threshold) {
                    if (shine_progress - shine_threshold < SHINE_IN_LENGTH) {
                        ctx.globalAlpha = Math.pow((shine_progress - shine_threshold) / SHINE_IN_LENGTH, 2/3) * MAX_SHINE_OPACITY;
                    } else if (shine_progress - shine_threshold - SHINE_IN_LENGTH < SHINE_OUT_LENGTH) {
                        ctx.globalAlpha = Math.pow(1 - (shine_progress - shine_threshold - SHINE_IN_LENGTH) / SHINE_OUT_LENGTH, 2/3) * MAX_SHINE_OPACITY;
                    } else {
                        ctx.restore();
                        continue;
                    }

                    ctx.drawImage(game.img.shine, x * game.tile_size, y * game.tile_size);
                }
                ctx.restore();
            }
        }
    }
}

/* ---------- event handlers ------------ */

function handle_mousedown(game, e, x, y) {
    if (intitle) return;
    if (wonitall) return;

    for (let b of game.buttons) {
        b.state = 0;
        if (0 <= x - b.x && x - b.x < 16 && 0 <= y - b.y && y - b.y < 16) {
            b.state = 2;
        }
    }
}

function handle_mouseup(game, e, x, y) {
    if (intitle) {
        game.long_transition(zb.transition.FADE, 500, function() {
            intitle = false;
            if (just_started) game.music.bgm.play();
            just_started = false;
            load_level();
        });
        return;
    }

    if (wonitall) {
        game.long_transition(zb.transition.FADE, 500, function() {
            intitle = true;
            wonitall = false;
            level_number = 1;
            load_level_data(levels.title);
        });
        return;
    }

    for (let b of game.buttons) {
        b.state = 0;
        if (0 <= x - b.x && x - b.x < 16 && 0 <= y - b.y && y - b.y < 16) {
            b.callback();
            b.state = 1;
        }
    }

    if (game.state === State.WIN) {
        advance_level();
        return;
    }

    if (game.state !== State.STAND) return;

    let tile_x = Math.floor(x / game.tile_size);
    let tile_y = Math.floor(y / game.tile_size);
    if (accessible_tiles.has(sofc([tile_x, tile_y]))) {
        create_undo_point();

        /* move the creach */
        console.log("Computing creature path");
        path = [];

        /* pathfinding x, y */
        let pfx = tile_x;
        let pfy = tile_y;
        do {
            path.unshift([ pfx, pfy ]);
            [pfx, pfy] = cofs(pathfinding[sofc([pfx, pfy])]);
        } while (pfx !== selected_creature.x || pfy !== selected_creature.y);

        console.log(path);

        game.state = State.MOVE;

        moving_creatures = [ selected_creature ];

        accessible_tiles.clear();
        do_single_move(selected_creature, path[0][0], path[0][1], true);
    } else {
        if (!selector_info) {
            accessible_tiles.clear();
            selected_creature = null;
            return;
        }

        let creatures = creatures_at(selector_info.x, selector_info.y);

        if (creatures.length === 0) {
            accessible_tiles.clear();
            selected_creature = null;
        }

        if (creatures[0] === selected_creature) {
            accessible_tiles.clear();
            selected_creature = null;
            return;
        }

        selected_creature = creatures[0];

        /* Compute creature's possible movements */
        compute_accessible_tiles_for_creature(selected_creature);

        if (accessible_tiles.size === 0) {
            selected_creature = null;
        } else {
            access_flash_timer = 0;
        }
    }
}

function handle_mousemove(game, e, x, y) {
    if (intitle) return;

    for (let b of game.buttons) {
        b.state = 0;
        if (0 <= x - b.x && x - b.x < 16 && 0 <= y - b.y && y - b.y < 16) {
            b.state = 1;
        }
    }

    if (game.state === State.WIN) return;

    let tile_x = Math.floor(x / game.tile_size);
    let tile_y = Math.floor(y / game.tile_size);

    selector_info = null;

    let creatures = creatures_at(tile_x, tile_y);
    if (creatures.length > 0 && !moving_creatures.includes(creatures[0])) {
        selector_info = {
            x: tile_x,
            y: tile_y,
        }
    } else if (accessible_tiles.has(sofc([ tile_x, tile_y ]))) {
        selector_info = {
            x: tile_x,
            y: tile_y,
        }
    }
}

let x_pressed = false;
function handle_keyup(game, e) {
    if (wonitall) return;
    if (game.transition.is_transitioning) return;

    // key up
    switch (e.key) {
        case 'm':
            game.toggle_mute();
            e.preventDefault();
            break;
        case 'r':
            reset();
            e.preventDefault();
            break;
        case 'z':
            undo();
            e.preventDefault();
            break;
        case 'x':
            x_pressed = true;
            break;
        case 'w':
            if (x_pressed) {
                delete_save();
                e.preventDefault();
            }
            break;
    }

    if (e.keyCode !== 88) {
        /* non-X key */
        x_pressed = false;
    }
}
