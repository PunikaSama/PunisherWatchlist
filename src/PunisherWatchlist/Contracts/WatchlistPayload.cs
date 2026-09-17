namespace PunisherWatchlist.Contracts;

public sealed class WatchlistPayload
{
    public IReadOnlyList<string> ItemIds { get; init; } = [];
}

public sealed class WatchlistState
{
    public string ItemId { get; init; } = string.Empty;

    public bool InWatchlist { get; init; }
}

