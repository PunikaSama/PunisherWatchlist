using PunisherWatchlist.Configuration;

namespace PunisherWatchlist.Tests;

public sealed class SettingsTests
{
    [Fact]
    public void Sanitize_RemovesInvalidAndDuplicateEntries()
    {
        Guid user = Guid.NewGuid();
        Guid item = Guid.NewGuid();
        var settings = new Settings
        {
            Users =
            [
                new UserWatchlist
                {
                    UserId = user,
                    Items =
                    [
                        new WatchlistEntry { ItemId = item, AddedAtUtc = DateTime.UtcNow.AddMinutes(-1) },
                        new WatchlistEntry { ItemId = item, AddedAtUtc = DateTime.UtcNow },
                        new WatchlistEntry { ItemId = Guid.Empty }
                    ]
                },
                new UserWatchlist { UserId = user },
                new UserWatchlist { UserId = Guid.Empty }
            ]
        };
        settings.Sanitize();
        UserWatchlist list = Assert.Single(settings.Users);
        Assert.Equal(user, list.UserId);
        Assert.Equal(item, Assert.Single(list.Items).ItemId);
    }
}
