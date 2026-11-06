import com.healthmarketscience.jackcess.*;
import java.io.File;
import java.util.*;
public class Check {
  public static void main(String[] a) throws Exception {
    try (Database d = DatabaseBuilder.open(new File(a[0]))) {
      for (String tn : d.getTableNames()) {
        Table t = d.getTable(tn); Map<Object, Integer> c = new HashMap<>(); int n = 0;
        for (Row r : t) { n++; c.merge(r.get("ID"), 1, Integer::sum); }
        long dups = c.values().stream().filter(v -> v > 1).count();
        System.out.println(tn + ": " + n + " rows, duplicate IDs: " + dups);
      }
      Table t = d.getTable(a[1]);
      for (Row r : t) if (Arrays.asList(a).subList(2, a.length).contains(String.valueOf(r.get("ID"))))
        System.out.println("  " + r.get("ID") + " " + r.get("Name") + " | " + r.get("Type") + " | M" + r.get("Mana") + " P" + r.get("Might") + " R" + r.get("Recycle") + " | FLAG " + r.get("FLAG") + " | " + r.get("Tag"));
    }
  }
}
