const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.css'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Api', 'WatchlistController.cs'), 'utf8');

for (const token of ['PunisherWatchlist/items', 'pw-watchlist-tab', 'pw-watchlist-card-button', 'pw-watchlist-detail-button', 'MuiAppBar-root', 'favoriteButton', 'pw-watchlist-card-button-adjacent', 'pw-watchlist-drawer-link', 'placeAfterFavorites', 'document.querySelectorAll(".card")', 'localStorageKey', 'pw-watchlist-route-active', 'isLibraryFolderCard', 'state.aliases', 'canonicalKey', 'canonicalClientId', 'normalizeStoredIds', '"Season"', 'const seriesId = parentSeriesId(item)', 'state.aliases.set(normalizeId(itemId), seriesId)', 'installNativeItemsProvider', 'api.getItems =', '#favoritesTab .itemsContainer', 'container.resume({ refresh: true })', 'favorite.click()', 'other.classList.remove("emby-tab-button-active", "Mui-selected", "navMenuOption-selected", "selected", "buttonActive", "pw-watchlist-nav-active")']) {
    if (!script.includes(token)) throw new Error(`Missing client feature: ${token}`);
}
for (const token of ['.pw-watchlist-button', '.pw-watchlist-card-button-adjacent:is(', '.card:hover .pw-watchlist-card-button', '@media (hover: none)', '.pw-watchlist-detail-button.pw-watchlist-active']) {
    if (!style.includes(token)) throw new Error(`Missing stylesheet rule: ${token}`);
}
for (const obsolete of ['function renderWatchlist', 'function watchlistCard', 'pw-watchlist-grid', 'pw-watchlist-item', 'pw-watchlist-card-actions']) {
    if (script.includes(obsolete) || style.includes(obsolete)) throw new Error(`Custom Watchlist renderer must stay removed: ${obsolete}`);
}

function extractFunction(name) {
    const start = script.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name} implementation.`);
    const bodyStart = script.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < script.length; index++) {
        if (script[index] === '{') depth++;
        if (script[index] === '}' && --depth === 0) {
            const source = script.slice(start, index + 1);
            return new Function(`${source}; return ${name};`)();
        }
    }
    throw new Error(`Could not parse ${name}.`);
}

const isFavoriteItemsRequest = extractFunction('isFavoriteItemsRequest');
const nativeWatchlistOptions = extractFunction('nativeWatchlistOptions');
if (!isFavoriteItemsRequest({ Filters: 'IsFavorite' }) || !isFavoriteItemsRequest({ filters: ['IsFavorite'] }) || !isFavoriteItemsRequest({ IsFavorite: true }) || isFavoriteItemsRequest({ Filters: 'IsPlayed' })) {
    throw new Error('Native Favorites request detection failed.');
}
const nativeOptions = nativeWatchlistOptions({ Filters: 'IsFavorite', IsFavorite: true, IncludeItemTypes: 'Series', Limit: 20 }, ['one', 'two']);
if (nativeOptions.Ids !== 'one,two' || nativeOptions.IncludeItemTypes !== 'Series' || nativeOptions.Limit !== 20 || 'Filters' in nativeOptions || 'IsFavorite' in nativeOptions) {
    throw new Error('Watchlist IDs are not mapped safely into the native Favorites query.');
}
const normalizeMatch = script.match(/function normalizeId\(value\) \{\s*([\s\S]*?)\n    \}/);
if (!normalizeMatch) throw new Error('Missing normalizeId implementation.');
const normalizeId = new Function('value', normalizeMatch[1]);
const dashedId = '0c23cde7-5a7e-6826-4c8a-375365a6ab17';
const compactId = '0c23cde75a7e68264c8a375365a6ab17';
if (normalizeId(dashedId) !== compactId || normalizeId(compactId) !== compactId) {
    throw new Error('Jellyfin D/N item ID normalization failed.');
}
const regressionIds = new Set([normalizeId(dashedId)]);
const regressionItems = new Map([[normalizeId(compactId), { Id: compactId }]]);
if (!regressionItems.has([...regressionIds][0])) {
    throw new Error('Watchlist IDs no longer resolve to Jellyfin item cache keys.');
}
if (controller.includes('ToString("D")') || !controller.includes('ToString("N")')) {
    throw new Error('Watchlist API must return compact Jellyfin item IDs.');
}
new Function(script);
console.log('PunisherWatchlist web assets validated.');
