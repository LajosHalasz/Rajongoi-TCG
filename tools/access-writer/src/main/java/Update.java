import com.healthmarketscience.jackcess.*;
import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Update rows of an Access table by ID from a JSON list: [{"ID":171, "Name":..., ...}, ...] */
public class Update {
  public static void main(String[] a) throws Exception {
    File db = new File(a[0]); String table = a[1];
    JsonArray rows = JsonParser.parseString(Files.readString(Path.of(a[2]), StandardCharsets.UTF_8)).getAsJsonArray();
    try (Database d = DatabaseBuilder.open(db)) {
      Table t = d.getTable(table);
      Map<Integer, JsonObject> byId = new HashMap<>();
      for (JsonElement e : rows) byId.put(e.getAsJsonObject().get("ID").getAsInt(), e.getAsJsonObject());
      Set<Integer> done = new HashSet<>();
      for (Row r : t) {
        Object idv = r.get("ID"); if (idv == null) continue;
        int id = ((Number) idv).intValue();
        JsonObject u = byId.get(id); if (u == null) continue;
        for (Map.Entry<String, JsonElement> f : u.entrySet()) {
          if (f.getKey().equals("ID")) continue;
          Column c = t.getColumn(f.getKey());
          Object old = r.get(f.getKey());
          Object nv = f.getValue().isJsonNull() ? null
            : c.getType() == DataType.BOOLEAN ? (Object) f.getValue().getAsBoolean()
            : c.getType() == DataType.LONG ? (Object) f.getValue().getAsInt()
            : f.getValue().getAsString();
          if (!Objects.equals(old, nv)) System.out.println("  " + id + " " + f.getKey() + ": " + old + " -> " + nv);
          r.put(f.getKey(), nv);
        }
        t.updateRow(r); done.add(id);
      }
      for (Integer id : byId.keySet()) if (!done.contains(id)) System.out.println("  !! ID " + id + " not found");
      System.out.println("updated " + done.size() + " rows in " + table);
    }
  }
}
