using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Serialization;
using PunisherWatchlist.Configuration;

namespace PunisherWatchlist;

public sealed class Plugin : BasePlugin<Settings>
{
    public static readonly Guid PluginGuid = Guid.Parse("35e8ff4a-837e-47ed-89e9-b4bda3a0359d");

    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer,
        IServerConfigurationManager serverConfigurationManager)
        : base(applicationPaths, xmlSerializer)
    {
        Current = this;
        ServerConfiguration = serverConfigurationManager;
        Configuration.Sanitize();
    }

    public static Plugin? Current { get; private set; }

    public IServerConfigurationManager ServerConfiguration { get; }

    public override Guid Id => PluginGuid;

    public override string Name => "PunisherWatchlist";

    public override string Description => "Adds a personal Watchlist tab and eye buttons to Jellyfin Web.";

    public override void UpdateConfiguration(MediaBrowser.Model.Plugins.BasePluginConfiguration configuration)
    {
        if (configuration is Settings settings)
        {
            settings.Sanitize();
        }

        base.UpdateConfiguration(configuration);
    }
}

