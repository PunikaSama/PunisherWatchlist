using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using PunisherWatchlist.Integration;
using PunisherWatchlist.Services;

namespace PunisherWatchlist;

public sealed class ServiceRegistration : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<WatchlistStore>();
        serviceCollection.AddHostedService<ClientRegistration>();
    }
}

