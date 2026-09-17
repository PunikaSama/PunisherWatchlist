using PunisherWatchlist.Configuration;

namespace PunisherWatchlist.Services;

public sealed class WatchlistStore
{
    private readonly object _sync = new();

    public IReadOnlyList<Guid> Get(Guid userId)
    {
        lock (_sync)
        {
            UserWatchlist? list = Current().Users.FirstOrDefault(entry => entry.UserId == userId);
            return list?.Items
                .OrderByDescending(entry => entry.AddedAtUtc)
                .Select(entry => entry.ItemId)
                .ToArray() ?? [];
        }
    }

    public bool Contains(Guid userId, Guid itemId)
    {
        lock (_sync)
        {
            return Current().Users
                .FirstOrDefault(entry => entry.UserId == userId)?
                .Items.Any(entry => entry.ItemId == itemId) == true;
        }
    }

    public bool Add(Guid userId, Guid itemId)
    {
        lock (_sync)
        {
            Settings settings = Current();
            UserWatchlist list = settings.Users.FirstOrDefault(entry => entry.UserId == userId)
                ?? AddUser(settings, userId);
            WatchlistEntry? existing = list.Items.FirstOrDefault(entry => entry.ItemId == itemId);
            if (existing is not null)
            {
                return false;
            }

            list.Items.Add(new WatchlistEntry { ItemId = itemId, AddedAtUtc = DateTime.UtcNow });
            Save(settings);
            return true;
        }
    }

    public bool Remove(Guid userId, Guid itemId)
    {
        lock (_sync)
        {
            Settings settings = Current();
            UserWatchlist? list = settings.Users.FirstOrDefault(entry => entry.UserId == userId);
            if (list is null || list.Items.RemoveAll(entry => entry.ItemId == itemId) == 0)
            {
                return false;
            }

            Save(settings);
            return true;
        }
    }

    private static UserWatchlist AddUser(Settings settings, Guid userId)
    {
        var list = new UserWatchlist { UserId = userId };
        settings.Users.Add(list);
        return list;
    }

    private static Settings Current()
    {
        Settings settings = Plugin.Current?.Configuration ?? new Settings();
        settings.Sanitize();
        return settings;
    }

    private static void Save(Settings settings)
    {
        Plugin.Current?.UpdateConfiguration(settings);
    }
}

