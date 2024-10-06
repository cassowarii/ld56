#!/usr/bin/python3

import ulvl
import sys

if len(sys.argv) < 2:
    print("usage:", sys.argv[0], "<infiles>")
    sys.exit(1)

screenwidth, screenheight = 8, 8

tilemapping = { 16: 5, 17: 6, 18: 7, 19: 8, 20: 9, 21: 10, 22: 11, 23: 12 }

FIRST_CREATURE_INDEX = 2
LAST_CREATURE_INDEX = 15

print("var levels={")
for filename in sys.argv[1:]:
    m = ulvl.TMX.load(filename)

    w = m.meta['width']
    h = m.meta['height']

    print('\t', filename.replace('.tmx', '').replace('levels/', ''), end=': { ')

    creatures = [ ]

    print('map: [', end='')
    for y in range(h):
        for x in range(w):
            thing = m.layers[0].tiles[y * w + x] - 1

            if thing >= FIRST_CREATURE_INDEX and thing <= LAST_CREATURE_INDEX:
                if thing % 2: # odd indices = blue on red tile, even = red on blue
                    print("3,", end='')
                else:
                    print("2,", end='')
                creatures.append({ 'type': (thing - FIRST_CREATURE_INDEX) // 2, 'color': thing % 2, 'x': x, 'y': y })
            else:
                print("" + str(tilemapping.get(thing, thing)) + ",", end='')

    print('],', end='');
    print('creatures: [', end='')

    for c in creatures:
        print("{x:", c['x'], ",y:", c['y'], ",type:", c['type'], ",color:", c['color'], end='},')

    print('],', end='')

    print(' },')

print("}")
