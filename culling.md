# Culling

## Relevant code

Relevant Sodium source code: [client.render.chunk.cull.graph](https://github.com/Minecraft-Java-Edition-Speedrunning/mcsr-sodium-1.16.1/tree/main/src/main/java/me/jellysquid/mods/sodium/client/render/chunk/cull/graph)

Sodium implements its own chunk culling algorithm, but it is basically identical to the vanilla algorithm. If you have a decompiled version of the game, you can find the vanilla culling algorithm in `net.minecraft.client.render.WorldRenderer.setupTerrain`.

Both the vanilla and Sodium culling algorithms utilize the same code for generating per-chunk visibility information, which can be found at `net.minecraft.client.render.chunk.ChunkOcclusionDataBuilder`.

## The C counter

The C counter has two values.
- The left value represents the number of currently rendered, non-empty subchunks.
- The right value represents the number of currently loaded subchunks.

## Chunks and subchunks

Chunks are 16x16x256 cuboids of blocks. Each chunk consists of 16 subchunks, each of which is a 16x16x16 cuboid of blocks. You can see the boundaries of chunks and subchunks by pressing `F3+G` and looking at the blue lines.

## Culling: high-level TL;DR

The game wants to avoid rendering subchunks you can't see to improve performance. It uses several rules to accomplish this, the simplest of which is that subchunks outside of your field of view will never be rendered. Certain strategies, such as mapless buried treasure and preemptive navigation, exploit this behavior. However, this strategy alone fails to cull many subchunks that are invisible to the player.

To improve things, the game uses a [breadth-first search](https://en.wikipedia.org/wiki/Breadth-first_search) to determine which subchunks are visible to the player. This BFS will usually start at the subchunk containing the player camera[^1], progressing outwards. Initially, it will go in all directions, but as the search continues, the BFS will not go backwards (back towards the player.) The BFS will not continue through any subchunk face which is a complete solid wall. The BFS will mark each subchunk it reaches as visible.

The effect of this is that *some* subchunks that are completely occluded by other subchunks will be culled. Strategies such as preemptive navigation rely on chunk culling being bad at its job, but chunk culling still sometimes gets in the way.

[^1]: See [picking the start node(s)](#picking-the-start-nodes) for more information on a certain caveat.

## Culling: in depth

The culling algorithm is split into two main parts:
- Generating per-subchunk visibility information
- Performing the subchunk graph BFS

### Part 1: Generating per-subchunk visibility information

Whenever a new chunk is loaded, the game generates *visibility information* for each of its subchunks. The visibility information for a given subchunk is simply a bitset, where each bit denotes whether the BFS can progress through a pair `(from, to)` of faces.

When generating this information, the game first checks how many solid, opaque blocks the subchunk contains.
- If there are less than 256 blocks, it can automatically assume that all faces are reachable from one another (since no one 16x16 slice of blocks can be completely opaque.)
- If the chunk is completely full (4096 opaque blocks), it automatically marks all faces as not reachable from any other.

If neither of the above conditions are true, the game starts a BFS through the non-opaque blocks of the subchunk from each block on the edge of the subchunk.
- Whenever a BFS reaches a block on another edge of the subchunk, it marks the appropriate `(from, to)` pair in the visibility bitset as true.
- Whenever a BFS checks a given block, it marks that block as opaque to prevent future BFSes from needlessly rescanning the entire subchunk hundreds of times.

This has an interesting property (which is mostly relevant for strongholds). If there are multiple "entrances" into one face of a subchunk, but only one of them actually reaches another face, you will still be able to see subchunks through that face. For example, a player standing on the left would still have the subchunk to the right rendered.

![Weird behavior](https://user-images.githubusercontent.com/46545045/235315586-5462a7dd-049a-488b-ba4f-b09d33467a07.png)

### Part 2: Performing the subchunk graph BFS

With the per-subchunk visibility data created, the game can determine which subchunks to cull by building a graph of subchunks and performing a BFS over them.

> This section covers the Sodium culling algorithm. The general idea behind the vanilla algorithm is essentially the same, but there are some implementation differences which may cause observable differences in culling behavior.

#### Picking the start node(s)

To start the search, the game must pick one (or more) subchunks to start the search with. Under normal circumstances, only one subchunk is picked to start the search with - the one containing the player camera. However, if there is not yet visibility data for that subchunk (e.g. it is not loaded), it will instead use several loaded subchunks.

> Note: If the player is in spectator and the camera is in an opaque block, occlusion checks are disabled entirely.

```java
List<ChunkGraphNode> bestNodes = new ArrayList<>();

for (int x2 = -this.renderDistance; x2 <= this.renderDistance; ++x2) {
    for (int z2 = -this.renderDistance; z2 <= this.renderDistance; ++z2) {
        ChunkGraphNode node = this.getNode(chunkX + x2, chunkY, chunkZ + z2);

        if (node == null || node.isCulledByFrustum(frustum)) {
            continue;
        }

        node.resetCullingState();
        node.setLastVisibleFrame(frame);

        bestNodes.add(node);
    }
}

bestNodes.sort(Comparator.comparingDouble(node -> node.getSquaredDistance(origin)));

for (ChunkGraphNode node : bestNodes) {
    this.visible.add(node, null);
}
```

> The [above code](https://github.com/Minecraft-Java-Edition-Speedrunning/mcsr-sodium-1.16.1/blob/main/src/main/java/me/jellysquid/mods/sodium/client/render/chunk/cull/graph/ChunkGraphCuller.java#L110) is from Sodium and is licensed under the LGPL 3.0.

> Note: The `visible` set is used as both a list of visible subchunks, and as a queue for subchunks to search in the BFS.

You might notice the `null` when adding a subchunk to the BFS queue - each entry (node) in the queue contains several pieces of information, not just subchunk position.

#### Subchunk nodes

Each queue entry doesn't contain just a subchunk and a heading direction - it also contains a set of directions which have been taken to get to this point. This is used to prevent going back towards the starting point or around walls.

#### The search

The game repeatedly takes an element (node) from the queue until it reaches the end. For each element it picks out of the queue, it tries to go in all 6 directions to adjacent subchunks, performing the following steps each time:

- Checks the set of already-visited directions for this node. If going backwards (the `to` direction is in the set), skips this direction and tries the next one. If the `from` direction is `null`, this will not cause any directions to get skipped.
- Checks that occlusion culling is enabled (the player is not in an opaque block and in spectator mode), and if so, makes sure that the per-subchunk visibility information allows for going in the given direction. If not, it skips this direction and tries the next one.
- Checks that the subchunk it is going to is within render distance.
- Checks that any corner of the subchunk it is going to is within the player's field of view (camera frustum).
- Marks the subchunk it is going to as visible by adding it to the queue with the appropriate `from` direction and set of already-used directions (by OR'ing the previous set and the new direction.)

At the end of this search, the queue contains a list of visible subchunks.

## Understanding culling

The above explanation is basically just a rough translation of the culling algorithm's code to English. Here's some resources and images which might help you build a better intuition for how culling functions in real scenarios:

- [Visibility simulator](https://tomcc.github.io/2014/08/31/visibility-1.html#rebuilding-the-graph)
  - These old 2014 blog posts from a Mojang employee have some other useful information and simulations as well. However, some information appears to be (understandably) out of date, such as the info on heuristics.

- [My Sodium fork](https://github.com/woofdoggo/sodium-fabric/tree/1.16.1) contains some extra visualizations of chunk culling information. It's illegal to use for real runs, but can be helpful for e.g. preemptive practice or experimentation.

### Culling does not go around walls

Here's a visualization of this. Here, I was standing on the tunnel in the right. You can see that the subchunk on the far left gets culled.

![image](https://user-images.githubusercontent.com/46545045/235322911-2fe17614-e655-4227-a0e7-19e4993be881.png)

Here's another example, this time in a real stronghold. Here, I was doing preemptive from starter, but the spawner did not give a spike. This is because the stone bricks above the doorways forced the culling algorithm to search down a subchunk, and it was thus never able to go back up one level to the subchunk with the spawner.

![2023-03-13_17](https://user-images.githubusercontent.com/46545045/235322976-cbd524c7-f3ea-4fc3-92ab-9c2b2c556a63.png)

### Culling in the middle of solid walls

Here, the completely solid top face of the subchunk containing starter means that basically the entire stronghold gets culled. I was standing in the small air gap. You can also see that several subchunks surrounding me did get rendered, due to the fact that the solid walls *within* my subchunk did not block the search.

![a](https://user-images.githubusercontent.com/46545045/235323155-fda38730-f6e5-4645-b17b-574bdacabf45.png)

After digging down into the subchunk with starter, you can see that much more of the stronghold is left unculled.

![a](https://user-images.githubusercontent.com/46545045/235323245-d7813203-f3f1-4a44-b0ae-036a5ed447e6.png)

### Hidden rooms

Here, even though the hidden room is on a chunk border, the ravine below it prevents that section of the stronghold from being culled.

![a](https://user-images.githubusercontent.com/46545045/235323333-8afe41df-d8f2-42db-8b4f-81baa0f3e985.png)

This hidden room is not flush with the chunk border, so culling is not a problem.

![a](https://user-images.githubusercontent.com/46545045/235323396-db7786ff-3dc9-400b-a52b-8ff8a652f9d6.png)

### Errata

Don't ask what's happening, I don't understand this yet.

![image](https://user-images.githubusercontent.com/46545045/235323021-dbca56bf-37f1-4dea-817b-78b2dfe01ad4.png)