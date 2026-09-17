using System.Reflection;
using System.Runtime.Loader;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace PunisherWatchlist.Integration;

public sealed class ClientRegistration : BackgroundService
{
    private static readonly Guid PatchId = Guid.Parse("996b0797-859d-4e67-86e5-7ddc76960a47");
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(3);
    private const string DependencyAssembly = "Jellyfin.Plugin.FileTransformation";
    private const string DependencyApi = "Jellyfin.Plugin.FileTransformation.PluginInterface";
    private readonly ILogger<ClientRegistration> _logger;

    public ClientRegistration(ILogger<ClientRegistration> logger)
    {
        _logger = logger;
    }

    public static bool Connected { get; private set; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        int attempt = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            attempt++;
            if (TryRegister())
            {
                _logger.LogInformation("PunisherWatchlist: Jellyfin Web integration registered.");
                return;
            }

            if (attempt == 1 || attempt % 10 == 0)
            {
                _logger.LogWarning("PunisherWatchlist is waiting for File Transformation 3.0.0.");
            }

            try
            {
                await Task.Delay(RetryDelay, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (Connected)
            {
                LocateDependencyApi()?.GetMethod("RemoveTransformation", BindingFlags.Public | BindingFlags.Static)?.Invoke(null, [PatchId]);
            }
        }
        catch (Exception exception)
        {
            _logger.LogDebug(exception, "PunisherWatchlist could not unregister its web integration.");
        }
        finally
        {
            Connected = false;
        }

        await base.StopAsync(cancellationToken).ConfigureAwait(false);
    }

    private bool TryRegister()
    {
        try
        {
            MethodInfo? register = LocateDependencyApi()?.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);
            if (register is null)
            {
                Connected = false;
                return false;
            }

            var registration = new JObject
            {
                ["id"] = PatchId.ToString("D"),
                ["fileNamePattern"] = "index.html",
                ["callbackAssembly"] = typeof(IndexHtmlPatch).Assembly.FullName,
                ["callbackClass"] = typeof(IndexHtmlPatch).FullName,
                ["callbackMethod"] = nameof(IndexHtmlPatch.Apply)
            };
            register.Invoke(null, [registration]);
            Connected = true;
            return true;
        }
        catch (Exception exception)
        {
            Connected = false;
            _logger.LogDebug(Unwrap(exception), "PunisherWatchlist could not register its web integration yet.");
            return false;
        }
    }

    private static Type? LocateDependencyApi()
    {
        Assembly? dependency = AssemblyLoadContext.All
            .SelectMany(context => context.Assemblies)
            .FirstOrDefault(assembly => string.Equals(assembly.GetName().Name, DependencyAssembly, StringComparison.Ordinal));
        return dependency?.GetType(DependencyApi, throwOnError: false, ignoreCase: false);
    }

    private static Exception Unwrap(Exception exception)
    {
        return exception is TargetInvocationException invocation ? invocation.InnerException ?? exception : exception;
    }
}

