# PunisherWatchlist

PunisherWatchlist adds a separate, personal Watchlist to Jellyfin Web. Movies, series, and episodes receive an eye button beside the familiar Jellyfin controls. Press the eye to add a title; press it again to remove the title. A **Watchlist** tab on the Jellyfin home screen shows all saved titles for the signed-in user.

## Features

- Personal server-side Watchlist for every Jellyfin user
- Eye button on supported media cards and item detail pages
- Add and remove with the same button
- Dedicated Watchlist tab on the home screen
- Movie, series, and episode support
- Responsive desktop and mobile layout
- Native styling plus matching integration for all PunisherFinTheme designs and accent colors

## Requirements

- Jellyfin Server and Jellyfin Web 12.1
- [File Transformation 3.0.0](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) enabled on the server
- A browser refresh after installing and restarting Jellyfin

## Installation

Download `PunisherWatchlist_1.0.0.0.zip` from Releases, extract it into a `PunisherWatchlist` directory below Jellyfin's plugin directory, and restart Jellyfin. File Transformation must also be installed and enabled because it loads the Watchlist client into Jellyfin Web.

## Build

```powershell
.\build.ps1
```

The release ZIP and its MD5 checksum are written to `artifacts`.

## Notes

Watchlists are stored in the plugin configuration on the Jellyfin server and are separated by Jellyfin user ID. The plugin does not replace or modify Jellyfin favorites.

## License

MIT
