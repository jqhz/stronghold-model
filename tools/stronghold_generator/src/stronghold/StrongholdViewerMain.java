package stronghold;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import kaptainwutax.biomeutils.source.OverworldBiomeSource;
import kaptainwutax.featureutils.structure.Stronghold;
import kaptainwutax.featureutils.structure.generator.structure.StrongholdGenerator;
import kaptainwutax.mcutils.rand.ChunkRand;
import kaptainwutax.mcutils.state.Dimension;
import kaptainwutax.mcutils.util.block.BlockBox;
import kaptainwutax.mcutils.util.pos.CPos;
import kaptainwutax.mcutils.version.MCVersion;
import kaptainwutax.seedutils.rand.JRand;
import kaptainwutax.terrainutils.TerrainGenerator;

public final class StrongholdViewerMain {
    private StrongholdViewerMain() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            printUsage();
            System.exit(2);
            return;
        }

        String command = args[0].trim().toLowerCase(Locale.ROOT);
        switch (command) {
            case "locations":
                if (args.length < 2) {
                    printUsage();
                    System.exit(2);
                    return;
                }
                long seed = Long.parseLong(args[1]);
                System.out.print(toLocationsJson(seed));
                return;
            case "generate":
                if (args.length < 4) {
                    printUsage();
                    System.exit(2);
                    return;
                }
                long generateSeed = Long.parseLong(args[1]);
                int chunkX = Integer.parseInt(args[2]);
                int chunkZ = Integer.parseInt(args[3]);
                System.out.print(toGenerateJson(generateSeed, chunkX, chunkZ));
                return;
            default:
                printUsage();
                System.exit(2);
        }
    }

    private static void printUsage() {
        System.err.println("Usage:");
        System.err.println("  java ... StrongholdViewerMain locations <seed>");
        System.err.println("  java ... StrongholdViewerMain generate <seed> <chunkX> <chunkZ>");
    }

    private static String toLocationsJson(long seed) {
        MCVersion version = MCVersion.v1_16_1;
        OverworldBiomeSource biomeSource = new OverworldBiomeSource(version, seed);
        Stronghold stronghold = new Stronghold(version);
        CPos[] starts = stronghold.getAllStarts(biomeSource, new JRand(0L));

        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"strongholds\":[");
        int count = Math.min(3, starts.length);
        for (int i = 0; i < count; i++) {
            CPos start = starts[i];
            if (i > 0) {
                sb.append(',');
            }
            sb.append('{');
            sb.append("\"chunkX\":").append(start.getX()).append(',');
            sb.append("\"chunkZ\":").append(start.getZ()).append(',');
            sb.append("\"x\":").append(start.getX() * 16).append(',');
            sb.append("\"z\":").append(start.getZ() * 16);
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String toGenerateJson(long seed, int chunkX, int chunkZ) throws Exception {
        MCVersion version = MCVersion.v1_16_1;
        OverworldBiomeSource biomeSource = new OverworldBiomeSource(version, seed);
        List<Stronghold.Piece> pieces = generatePiecesForStart(version, biomeSource, new CPos(chunkX, chunkZ));

        int startX = chunkX * 16 + 8;
        int startZ = chunkZ * 16 + 8;
        for (Stronghold.Piece piece : pieces) {
            if ("Start".equals(piece.getClass().getSimpleName())) {
                BlockBox box = piece.getBoundingBox();
                if (box != null) {
                    startX = box.minX;
                    startZ = box.minZ;
                }
                break;
            }
        }

        StringBuilder sb = new StringBuilder(Math.max(4096, pieces.size() * 192));
        sb.append("{\n");
        appendField(sb, "worldSeed", Long.toString(seed), true, 2, false);
        appendField(sb, "chunkX", Integer.toString(chunkX), false, 2, false);
        appendField(sb, "chunkZ", Integer.toString(chunkZ), false, 2, false);
        appendField(sb, "startX", Integer.toString(startX), false, 2, false);
        appendField(sb, "startZ", Integer.toString(startZ), false, 2, false);
        sb.append("  \"pieces\": [\n");

        for (int i = 0; i < pieces.size(); i++) {
            Stronghold.Piece piece = pieces.get(i);
            BlockBox box = piece.getBoundingBox();
            String type = piece.getClass().getSimpleName();
            boolean isPortal = "PortalRoom".equals(type);

            sb.append("    {");
            sb.append("\"type\": ").append(quote(type)).append(", ");
            if (box != null) {
                sb.append("\"minX\": ").append(box.minX).append(", ");
                sb.append("\"minY\": ").append(box.minY).append(", ");
                sb.append("\"minZ\": ").append(box.minZ).append(", ");
                sb.append("\"maxX\": ").append(box.maxX).append(", ");
                sb.append("\"maxY\": ").append(box.maxY).append(", ");
                sb.append("\"maxZ\": ").append(box.maxZ).append(", ");
                sb.append("\"chunkX\": ").append(floorDiv(box.minX, 16)).append(", ");
                sb.append("\"chunkZ\": ").append(floorDiv(box.minZ, 16)).append(", ");
            } else {
                sb.append("\"minX\": null, \"minY\": null, \"minZ\": null, ");
                sb.append("\"maxX\": null, \"maxY\": null, \"maxZ\": null, ");
                sb.append("\"chunkX\": ").append(chunkX).append(", ");
                sb.append("\"chunkZ\": ").append(chunkZ).append(", ");
            }
            sb.append("\"isPortal\": ").append(isPortal ? "true" : "false");
            sb.append('}');
            if (i + 1 < pieces.size()) {
                sb.append(',');
            }
            sb.append('\n');
        }

        sb.append("  ]\n");
        sb.append("}\n");
        return sb.toString();
    }

    private static List<Stronghold.Piece> generatePiecesForStart(
            MCVersion version,
            OverworldBiomeSource biomeSource,
            CPos start
    ) {
        TerrainGenerator terrainGenerator = TerrainGenerator.of(Dimension.OVERWORLD, biomeSource);
        StrongholdGenerator generator = new StrongholdGenerator(version);
        generator.generate(terrainGenerator, start.getX(), start.getZ(), new ChunkRand());
        return new ArrayList<>(generator.pieceList);
    }

    private static int floorDiv(int value, int divisor) {
        int quotient = value / divisor;
        int remainder = value % divisor;
        if (remainder != 0 && ((remainder < 0) != (divisor < 0))) {
            quotient--;
        }
        return quotient;
    }

    private static void appendField(
            StringBuilder sb,
            String name,
            String value,
            boolean quotedName,
            int indent,
            boolean last
    ) {
        for (int i = 0; i < indent; i++) {
            sb.append(' ');
        }
        if (quotedName) {
            sb.append(quote(name));
        } else {
            sb.append('"').append(name).append('"');
        }
        sb.append(": ").append(value);
        if (!last) {
            sb.append(',');
        }
        sb.append('\n');
    }

    private static String quote(String text) {
        StringBuilder sb = new StringBuilder(text.length() + 8);
        sb.append('"');
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\\' || ch == '"') {
                sb.append('\\').append(ch);
            } else if (ch == '\n') {
                sb.append("\\n");
            } else if (ch == '\r') {
                sb.append("\\r");
            } else if (ch == '\t') {
                sb.append("\\t");
            } else if (ch < 32) {
                sb.append(String.format(Locale.ROOT, "\\u%04x", (int) ch));
            } else {
                sb.append(ch);
            }
        }
        sb.append('"');
        return sb.toString();
    }
}
