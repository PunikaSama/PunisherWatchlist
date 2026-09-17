using System.Text.Json.Serialization;
using MediaBrowser.Common.Net;

namespace PunisherWatchlist.Integration;

public static class IndexHtmlPatch
{
    private const string ElementId = "punisher-watchlist-client-loader";

    public static string Apply(HtmlDocumentInput input)
    {
        string html = input.Contents ?? string.Empty;
        if (html.Length == 0 || html.Contains(ElementId, StringComparison.OrdinalIgnoreCase))
        {
            return html;
        }

        int insertionPoint = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (insertionPoint < 0)
        {
            return html;
        }

        string baseUrl = Plugin.Current?.ServerConfiguration.GetNetworkConfiguration().BaseUrl?.Trim() ?? string.Empty;
        string prefix = string.IsNullOrEmpty(baseUrl) ? string.Empty : $"/{baseUrl.Trim('/')}";
        string version = typeof(IndexHtmlPatch).Assembly.GetName().Version?.ToString() ?? "0";
        string escapedVersion = Uri.EscapeDataString(version);
        string elements = $"<link id=\"{ElementId}-style\" rel=\"stylesheet\" href=\"{prefix}/PunisherWatchlist/style?v={escapedVersion}\"><script id=\"{ElementId}\" defer src=\"{prefix}/PunisherWatchlist/web?v={escapedVersion}\"></script>";
        return html.Insert(insertionPoint, elements);
    }
}

public sealed class HtmlDocumentInput
{
    [JsonPropertyName("contents")]
    public string? Contents { get; init; }
}

