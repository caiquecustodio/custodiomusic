package expo.modules.musicdownloads;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.room.*;
import java.util.List;

@Database(entities = {DownloadsDb.Entry.class}, version = 1, exportSchema = false)
public abstract class DownloadsDb extends RoomDatabase {
  public abstract Entries entries();
  private static volatile DownloadsDb instance;
  public static DownloadsDb get(Context context) {
    if (instance == null) synchronized (DownloadsDb.class) {
      if (instance == null) instance = Room.databaseBuilder(context.getApplicationContext(), DownloadsDb.class, "custodio-downloads.db").build();
    }
    return instance;
  }
  @Entity(tableName = "downloads")
  public static class Entry {
    @PrimaryKey @NonNull public String id = "";
    @NonNull public String state = "queued";
    @NonNull public String payload = "{}";
    public long created;
    public long done;
    public long total;
    public String validator;
    public String uri;
    public String artwork;
    public String error;
    public double duration;
  }
  @Dao public interface Entries {
    @Query("SELECT * FROM downloads ORDER BY created ASC") List<Entry> all();
    @Query("SELECT * FROM downloads WHERE id = :id LIMIT 1") Entry find(String id);
    @Query("SELECT * FROM downloads WHERE state = 'queued' ORDER BY created ASC LIMIT 1") Entry next();
    @Insert(onConflict = OnConflictStrategy.REPLACE) void save(Entry entry);
    @Query("UPDATE downloads SET state = 'interrupted', error = 'Download interrompido. Toque em tentar novamente.' WHERE state IN ('downloading', 'resolving', 'processing')") void recover();
    @Query("UPDATE downloads SET state = :state, error = :error WHERE id = :id") void state(String id, String state, String error);
  }
}
