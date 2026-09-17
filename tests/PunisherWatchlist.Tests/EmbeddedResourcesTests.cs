namespace PunisherWatchlist.Tests;

public sealed class EmbeddedResourcesTests
{
    [Fact]
    public void AssemblyContainsClientScriptAndStylesheet()
    {
        string[] resources = typeof(Plugin).Assembly.GetManifestResourceNames();
        Assert.Contains("PunisherWatchlist.Web.punisher-watchlist.js", resources);
        Assert.Contains("PunisherWatchlist.Web.punisher-watchlist.css", resources);
    }
}
