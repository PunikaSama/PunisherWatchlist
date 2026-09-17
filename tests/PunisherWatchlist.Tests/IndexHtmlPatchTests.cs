using PunisherWatchlist.Integration;

namespace PunisherWatchlist.Tests;

public sealed class IndexHtmlPatchTests
{
    [Fact]
    public void Apply_AddsScriptAndStyleBeforeBodyEnd()
    {
        const string source = "<html><body><main></main></body></html>";
        string result = IndexHtmlPatch.Apply(new HtmlDocumentInput { Contents = source });
        Assert.Contains("id=\"punisher-watchlist-client-loader\"", result, StringComparison.Ordinal);
        Assert.Contains("/PunisherWatchlist/web?v=", result, StringComparison.Ordinal);
        Assert.Contains("/PunisherWatchlist/style?v=", result, StringComparison.Ordinal);
        Assert.True(result.IndexOf("punisher-watchlist-client-loader", StringComparison.Ordinal) < result.IndexOf("</body>", StringComparison.Ordinal));
    }

    [Fact]
    public void Apply_DoesNotDuplicateLoader()
    {
        const string source = "<body><script id=\"punisher-watchlist-client-loader\"></script></body>";
        Assert.Equal(source, IndexHtmlPatch.Apply(new HtmlDocumentInput { Contents = source }));
    }

    [Theory]
    [InlineData("")]
    [InlineData("<html></html>")]
    public void Apply_LeavesUnsupportedDocumentsUntouched(string source)
    {
        Assert.Equal(source, IndexHtmlPatch.Apply(new HtmlDocumentInput { Contents = source }));
    }
}
