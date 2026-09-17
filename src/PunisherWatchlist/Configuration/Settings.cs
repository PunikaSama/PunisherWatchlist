using MediaBrowser.Model.Plugins;

namespace PunisherWatchlist.Configuration;

public sealed class Settings : BasePluginConfiguration
{
    public List<UserWatchlist> Users { get; set; } = [];

    public void Sanitize()
    {
        Users ??= [];
        Users = Users
            .Where(entry => entry.UserId != Guid.Empty)
            .GroupBy(entry => entry.UserId)
            .Select(group => new UserWatchlist
            {
                UserId = group.Key,
                Items = group.SelectMany(entry => entry.Items ?? [])
                    .Where(item => item.ItemId != Guid.Empty)
                    .GroupBy(item => item.ItemId)
                    .Select(items => items.OrderByDescending(item => item.AddedAtUtc).First())
                    .OrderByDescending(item => item.AddedAtUtc)
                    .ToList()
            })
            .ToList();
    }
}

public sealed class UserWatchlist
{
    public Guid UserId { get; set; }

    public List<WatchlistEntry> Items { get; set; } = [];
}

public sealed class WatchlistEntry
{
    public Guid ItemId { get; set; }

    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
}

