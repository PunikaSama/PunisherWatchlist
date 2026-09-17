# PunisherWatchlist

![PunisherWatchlist banner](PunisherWatchlist.png)

PunisherWatchlist adds a separate, personal Watchlist to Jellyfin Web. Movies, series, and episodes receive an eye button beside the familiar Jellyfin controls. Press the eye to add a title; press it again to remove the title. A **Watchlist** tab on the Jellyfin home screen shows all saved titles for the signed-in user.

## Features

- Personal server-side Watchlist for every Jellyfin user
- Eye button on supported media cards and item detail pages
- Add and remove with the same button
- Dedicated Watchlist tab on the home screen
- Movie, series, and episode support
- Jellyfin's native Favorites sections, cards, hover menus, metadata, badges, and responsive behavior
- Matching integration for all PunisherFinTheme designs and accent colors

## Requirements

- Jellyfin Server and Jellyfin Web 12.1
- [File Transformation 3.0.0](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) enabled on the server
- A browser refresh after installing and restarting Jellyfin

## Installation

Add this repository URL under **Dashboard → Plugins → Repositories**:

```text
https://raw.githubusercontent.com/PunikaSama/PunisherWatchlist/main/manifest.json
```

Open the plugin catalog, install PunisherWatchlist, and restart Jellyfin completely. File Transformation 3.0.0.0 must also be installed and enabled because it loads the Watchlist client into Jellyfin Web. After the restart, refresh the browser with `Ctrl + F5`.

## Build

```powershell
.\build.ps1
```

The release ZIP and its MD5 checksum are written to `artifacts`.

## Notes

Watchlists are stored in the plugin configuration on the Jellyfin server and are separated by Jellyfin user ID. The Watchlist reuses Jellyfin's native Favorites presentation but does not replace or modify the user's actual favorites.

## License

MIT
