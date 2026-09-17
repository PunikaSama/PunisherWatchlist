using System.Net.Mime;
using System.Reflection;
using System.Security.Claims;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PunisherWatchlist.Contracts;
using PunisherWatchlist.Services;

namespace PunisherWatchlist.Api;

[ApiController]
[Route("PunisherWatchlist")]
public sealed class WatchlistController : ControllerBase
{
    private const string ScriptResource = "PunisherWatchlist.Web.punisher-watchlist.js";
    private const string StyleResource = "PunisherWatchlist.Web.punisher-watchlist.css";
    private readonly IUserManager _users;
    private readonly ILibraryManager _library;
    private readonly WatchlistStore _store;

    public WatchlistController(IUserManager users, ILibraryManager library, WatchlistStore store)
    {
        _users = users;
        _library = library;
        _store = store;
    }

    [HttpGet("web")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public ActionResult WebScript() => Embedded(ScriptResource, "application/javascript; charset=utf-8");

    [HttpGet("style")]
    [AllowAnonymous]
    [Produces("text/css")]
    public ActionResult WebStyle() => Embedded(StyleResource, "text/css; charset=utf-8");

    [HttpGet("items")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    [ProducesResponseType(typeof(WatchlistPayload), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<WatchlistPayload> Items()
    {
        Jellyfin.Database.Implementations.Entities.User? user = CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        var canonicalIds = new List<Guid>();
        foreach (Guid storedId in _store.Get(user.Id))
        {
            BaseItem? item = ResolveWatchlistItem(storedId, user.Id);
            if (item is null || !Supported(item.GetBaseItemKind()))
            {
                continue;
            }

            if (item.Id != storedId)
            {
                _store.Remove(user.Id, storedId);
                _store.Add(user.Id, item.Id);
            }

            canonicalIds.Add(item.Id);
        }

        string[] visible = canonicalIds.Distinct().Select(id => id.ToString("D")).ToArray();
        return Ok(new WatchlistPayload { ItemIds = visible });
    }

    [HttpGet("items/{itemId:guid}")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<WatchlistState> State(Guid itemId)
    {
        Jellyfin.Database.Implementations.Entities.User? user = CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        BaseItem? item = ResolveWatchlistItem(itemId, user.Id);
        Guid canonicalId = item?.Id ?? itemId;
        return Ok(new WatchlistState { ItemId = canonicalId.ToString("D"), InWatchlist = _store.Contains(user.Id, canonicalId) });
    }

    [HttpPost("items/{itemId:guid}/toggle")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<WatchlistState> Toggle(Guid itemId)
    {
        Jellyfin.Database.Implementations.Entities.User? user = CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        BaseItem? item = ResolveWatchlistItem(itemId, user.Id);
        if (item is null || !Supported(item.GetBaseItemKind()))
        {
            return NotFound();
        }

        bool inWatchlist;
        Guid canonicalId = item.Id;
        if (_store.Contains(user.Id, canonicalId))
        {
            _store.Remove(user.Id, canonicalId);
            inWatchlist = false;
        }
        else
        {
            _store.Add(user.Id, canonicalId);
            inWatchlist = true;
        }

        return Ok(new WatchlistState { ItemId = canonicalId.ToString("D"), InWatchlist = inWatchlist });
    }

    [HttpPut("items/{itemId:guid}")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<WatchlistState> Add(Guid itemId)
    {
        Jellyfin.Database.Implementations.Entities.User? user = CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        BaseItem? item = ResolveWatchlistItem(itemId, user.Id);
        if (item is null || !Supported(item.GetBaseItemKind()))
        {
            return NotFound();
        }

        _store.Add(user.Id, item.Id);
        return Ok(new WatchlistState { ItemId = item.Id.ToString("D"), InWatchlist = true });
    }

    [HttpDelete("items/{itemId:guid}")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<WatchlistState> Remove(Guid itemId)
    {
        Jellyfin.Database.Implementations.Entities.User? user = CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        BaseItem? item = ResolveWatchlistItem(itemId, user.Id);
        Guid canonicalId = item?.Id ?? itemId;
        _store.Remove(user.Id, canonicalId);
        return Ok(new WatchlistState { ItemId = canonicalId.ToString("D"), InWatchlist = false });
    }

    private ActionResult Embedded(string resourceName, string contentType)
    {
        Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "no-cache, no-store";
        return File(stream, contentType);
    }

    private Jellyfin.Database.Implementations.Entities.User? CurrentUser()
    {
        string? id = User.Claims
            .FirstOrDefault(claim => claim.Type.Equals("Jellyfin-UserId", StringComparison.OrdinalIgnoreCase))?
            .Value;
        id ??= User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(id, out Guid userId) ? _users.GetUserById(userId) : null;
    }

    private BaseItem? ResolveWatchlistItem(Guid itemId, Guid userId)
    {
        BaseItem? item = _library.GetItemById<BaseItem>(itemId, userId);
        if (item is Episode episode)
        {
            return episode.Series is null
                ? item
                : _library.GetItemById<BaseItem>(episode.Series.Id, userId) ?? episode.Series;
        }

        if (item is Season season)
        {
            return season.Series is null
                ? item
                : _library.GetItemById<BaseItem>(season.Series.Id, userId) ?? season.Series;
        }

        return item;
    }

    private static bool Supported(BaseItemKind kind)
    {
        return kind is BaseItemKind.Movie or BaseItemKind.Series or BaseItemKind.Episode;
    }
}
